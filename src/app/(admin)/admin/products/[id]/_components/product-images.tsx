"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
  type ImageActionState,
} from "../image-actions"

type ImageRow = {
  id: string
  imageUrl: string
  imageType: string
  sortOrder: number
}

type Props = {
  productId: string
  images: ImageRow[]
}

const IMAGE_TYPES = ["FRONT", "SECONDARY", "REFERENCE"] as const

export default function ProductImages({ productId, images }: Props) {
  const uploadAction = uploadProductImage.bind(null, productId)
  const deleteAction = deleteProductImage.bind(null, productId)

  const [uploadState, uploadFormAction, uploading] = useActionState<
    ImageActionState,
    FormData
  >(async (prev, fd) => {
    const res = await uploadAction(prev, fd)
    if (res.error) toast.error(res.error)
    else if (res.ok) toast.success("Image uploaded")
    return res
  }, {})

  const [, deleteFormAction, deleting] = useActionState<
    ImageActionState,
    FormData
  >(async (prev, fd) => {
    const res = await deleteAction(prev, fd)
    if (res.error) toast.error(res.error)
    else if (res.ok) toast.success("Image deleted")
    return res
  }, {})

  const [isReordering, startReorder] = useTransition()
  const [localOrder, setLocalOrder] = useState<ImageRow[]>(images)

  // Keep local order in sync if server data changes (e.g. after revalidate)
  const serverIds = images.map((i) => i.id).join(",")
  const localIds = localOrder.map((i) => i.id).join(",")
  if (serverIds !== localIds) {
    setLocalOrder(images)
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...localOrder]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setLocalOrder(next)
    startReorder(async () => {
      const res = await reorderProductImages(
        productId,
        next.map((i) => i.id)
      )
      if (res.error) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Images
        </h2>
        <span className="text-xs text-muted-foreground">
          {localOrder.length} image{localOrder.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Upload form */}
      <form
        action={uploadFormAction}
        className="form-section flex flex-wrap items-end gap-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="file">File</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            disabled={uploading}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imageType">Type</Label>
          <Select name="imageType" defaultValue="REFERENCE" disabled={uploading}>
            <SelectTrigger id="imageType" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {uploadState.error && (
        <p role="alert" className="text-sm text-destructive">
          {uploadState.error}
        </p>
      )}

      {/* Image grid */}
      {localOrder.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No images yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {localOrder.map((img, index) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5"
            >
              <div className="relative aspect-square w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.imageUrl}
                  alt={`Product image ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <Badge variant="secondary">{img.imageType}</Badge>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || isReordering}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === localOrder.length - 1 || isReordering}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
              </div>
              <form action={deleteFormAction} className="px-2 pb-2">
                <input type="hidden" name="imageId" value={img.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Delete
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
