"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth-helpers"
import { writeAuditLog } from "@/lib/audit"
import {
  getSupabaseAdmin,
  productImagePublicUrl,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/supabase-server"
import { detectMime, isAllowedImageMime } from "@/lib/server/image-signatures"
import type { ImageType } from "@/generated/prisma/client"

const IMAGE_TYPES = ["FRONT", "SECONDARY", "REFERENCE"] as const
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

export type ImageActionState = { error?: string; ok?: boolean }

export async function uploadProductImage(
  productId: string,
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  const { user } = await requireRole("ADMIN")

  const file = formData.get("file")
  const imageType = formData.get("imageType")

  const typeParse = z.enum(IMAGE_TYPES).safeParse(imageType)
  if (!typeParse.success) return { error: "Invalid image type" }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected" }
  }
  if (file.size > MAX_BYTES) {
    return { error: "File too large (max 5MB)" }
  }

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  // Validate by magic bytes, not client-supplied Content-Type.
  const detectedMime = detectMime(bytes)
  if (!detectedMime || !isAllowedImageMime(detectedMime)) {
    return { error: "Unsupported file type. Upload a JPEG, PNG, WebP, or GIF." }
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })
  if (!product) return { error: "Product not found" }

  // Extension from detected MIME (authoritative), not client-supplied file name.
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  }
  const ext = mimeToExt[detectedMime] ?? "bin"
  const objectPath = `${productId}/${crypto.randomUUID()}.${ext}`

  const supabase = getSupabaseAdmin()
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(objectPath, arrayBuffer, {
      contentType: detectedMime,
      upsert: false,
    })

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` }
  }

  const imageUrl = productImagePublicUrl(objectPath)

  const last = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })

  let image: { id: string }
  try {
    image = await prisma.productImage.create({
      data: {
        productId,
        imageUrl,
        imageType: typeParse.data as ImageType,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
  } catch {
    // DB write failed — remove the orphaned storage object.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([objectPath])
    return { error: "Failed to save image record. The uploaded file has been removed." }
  }

  await writeAuditLog(user.id, "UPLOAD_IMAGE", "ProductImage", image.id, {
    productId,
    imageType: typeParse.data,
    objectPath,
  })

  revalidatePath(`/admin/products/${productId}`)
  return { ok: true }
}

export async function deleteProductImage(
  productId: string,
  _prevState: ImageActionState,
  formData: FormData
): Promise<ImageActionState> {
  const { user } = await requireRole("ADMIN")
  const imageId = formData.get("imageId") as string
  if (!imageId) return { error: "Missing image id" }

  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, productId: true, imageUrl: true },
  })
  if (!image || image.productId !== productId) {
    return { error: "Image not found" }
  }

  // Delete DB record first — the DB is authoritative. Storage cleanup is
  // best-effort: an orphaned storage object is non-critical, but a dangling
  // DB record pointing to a deleted file causes broken image URLs.
  await prisma.productImage.delete({ where: { id: imageId } })

  await writeAuditLog(user.id, "DELETE_IMAGE", "ProductImage", imageId, {
    productId,
  })

  // Best-effort remove from storage.
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`
  const idx = image.imageUrl.indexOf(marker)
  if (idx !== -1) {
    const objectPath = image.imageUrl.slice(idx + marker.length)
    await getSupabaseAdmin()
      .storage.from(PRODUCT_IMAGES_BUCKET)
      .remove([objectPath])
  }

  revalidatePath(`/admin/products/${productId}`)
  return { ok: true }
}

export async function reorderProductImages(
  productId: string,
  orderedIds: string[]
): Promise<ImageActionState> {
  const { user } = await requireRole("ADMIN")

  const images = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true },
  })
  const ownedIds = new Set(images.map((i) => i.id))
  const filtered = orderedIds.filter((id) => ownedIds.has(id))

  await prisma.$transaction(
    filtered.map((id, index) =>
      prisma.productImage.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  )

  await writeAuditLog(user.id, "REORDER_IMAGES", "Product", productId, {
    order: filtered,
  })

  revalidatePath(`/admin/products/${productId}`)
  return { ok: true }
}
