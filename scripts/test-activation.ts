/**
 * Focused regression tests for QR token activation race conditions.
 *
 * Tests the /api/qr/activate route logic with a real database connection.
 * Coverage:
 *   - normal ASSIGNED -> ACTIVATED works
 *   - already ACTIVATED returns HTTP 200 idempotently
 *   - claim race with fresh ACTIVATED returns HTTP 200
 *   - claim race with fresh VOIDED returns HTTP 409
 *   - missing package during activation returns 409 and does not leave DB activated
 *
 * Run:  tsx scripts/test-activation.ts
 */

import "dotenv/config"
import crypto from "crypto"
import { NextRequest } from "next/server"
import { prisma } from "../src/lib/prisma"
import { POST as activatePost } from "../src/app/api/qr/activate/route"
import { GET as qrGet } from "../src/app/api/qr/[token]/route"
import { resolveActivationRace } from "../src/lib/server/activation-race"

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.toUpperCase()
const prefix = `ACTV-${runId}-`
let exitCode = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`)
    exitCode = 1
  } else {
    console.log(`  ✅ PASS: ${message}`)
  }
}

function uid(label: string) {
  return `${prefix}${label}-${crypto.randomUUID().slice(0, 6)}`.toUpperCase()
}

function mockReq(token: string): NextRequest {
  return new NextRequest("http://localhost/api/qr/activate", {
    method: "POST",
    headers: { "x-api-key": process.env.MOBILE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  })
}

function mockGet(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/qr/${token}`, {
    method: "GET",
    headers: { "x-api-key": process.env.MOBILE_API_KEY! },
  })
}

async function runTests() {
  console.log(`\nActivation Race Test Run: ${runId}\n`)

  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } })
  if (!adminUser) throw new Error("No ADMIN user found — run db:seed first")

  const routineType = await prisma.routineType.findFirst()
  if (!routineType) throw new Error("No routine type found")

  const diagnosis = await prisma.diagnosis.create({
    data: { name: "Test Diag", slug: uid("D-SLUG") }
  })

  const routine = await prisma.routineTemplate.create({
    data: {
      name: uid("RT"),
      routineTypeId: routineType.id,
      active: true,
    },
  })

  await prisma.routineTemplateDiagnosis.create({
    data: { routineTemplateId: routine.id, diagnosisId: diagnosis.id }
  })

  // ── TEST 1: normal ASSIGNED -> ACTIVATED works ──
  console.log("=== TEST 1: normal ASSIGNED -> ACTIVATED ===")
  const t1 = await prisma.qRToken.create({
    data: { token: uid("TK1"), status: "ASSIGNED", assignedAt: new Date(), generatedByUserId: adminUser.id },
  })
  const p1 = await prisma.package.create({
    data: { qrTokenId: t1.id, routineTemplateId: routine.id, status: "ASSIGNED", createdByUserId: adminUser.id },
  })
  
  const res1 = await activatePost(mockReq(t1.token))
  const body1 = await res1.json()
  
  if (res1.status !== 200) console.log("RES1:", res1.status, body1)
  assert(res1.status === 200, "1: returns HTTP 200")
  assert(body1.status === "ACTIVATED", "1: payload status is ACTIVATED")
  assert(body1.message === "Token activated", "1: message is 'Token activated'")
  
  const p1After = await prisma.package.findUnique({ where: { id: p1.id } })
  assert(p1After?.status === "ACTIVATED", "1: package status updated to ACTIVATED")

  const getRes = await qrGet(mockGet(t1.token), { params: Promise.resolve({ token: t1.token }) })
  const getBody = await getRes.json()
  
  assert(getRes.status === 200, "1a: GET token returns 200")
  assert(getBody.routine?.routineType?.id === routineType.id, "1b: GET response includes routineType")
  assert(getBody.routine?.diagnoses?.[0]?.id === diagnosis.id, "1c: GET response includes diagnoses")

  // ── TEST 2: already ACTIVATED returns HTTP 200 idempotently ──
  console.log("\n=== TEST 2: already ACTIVATED returns HTTP 200 ===")
  const res2 = await activatePost(mockReq(t1.token))
  const body2 = await res2.json()
  
  if (res2.status !== 200) console.log("RES2:", res2.status, body2)
  assert(res2.status === 200, "2: returns HTTP 200 for already ACTIVATED")
  assert(body2.message === "Token already activated", "2: message is 'Token already activated'")

  // ── TEST 3: missing package during activation ──
  console.log("\n=== TEST 3: missing package returns 409 and avoids partial activation ===")
  // Token is ASSIGNED, but no package exists
  const t3 = await prisma.qRToken.create({
    data: { token: uid("TK3"), status: "ASSIGNED", assignedAt: new Date(), generatedByUserId: adminUser.id },
  })
  
  const res3 = await activatePost(mockReq(t3.token))
  const body3 = await res3.json()
  
  if (res3.status !== 409) console.log("RES3:", res3.status, body3)
  assert(res3.status === 409, "3: returns HTTP 409")
  assert(body3.error === "Token has no assigned package to activate", "3: exact error message for missing package")
  
  const t3After = await prisma.qRToken.findUnique({ where: { id: t3.id } })
  assert(t3After?.status === "ASSIGNED", "3: token remains ASSIGNED in DB")
  
  const eventCount3 = await prisma.activationEvent.count({ where: { qrTokenId: t3.id } })
  assert(eventCount3 === 0, "3: no ActivationEvent created")

  // ── TEST 4: claim race classification ──
  console.log("\n=== TEST 4: claim race classification ===")
  const resMissing = await resolveActivationRace(null)
  assert(resMissing.status === 404, "4a: missing token returns 404 not-found")

  const activatedDate = new Date()
  const resActivated = await resolveActivationRace({ token: "T", status: "ACTIVATED", activatedAt: activatedDate })
  const bodyActivated = await resActivated.json()
  assert(resActivated.status === 200, "4b: fresh ACTIVATED returns 200 idempotent success")
  assert(bodyActivated.message === "Token already activated", "4b: message is correct")

  const resVoided = await resolveActivationRace({ token: "T", status: "VOIDED", activatedAt: null })
  assert(resVoided.status === 409, "4c: fresh VOIDED returns 409 conflict")

  const resReplaced = await resolveActivationRace({ token: "T", status: "REPLACED", activatedAt: null })
  assert(resReplaced.status === 409, "4d: fresh REPLACED returns 409 conflict")

  const resAvailable = await resolveActivationRace({ token: "T", status: "AVAILABLE", activatedAt: null })
  assert(resAvailable.status === 409, "4e: fresh AVAILABLE returns 409 conflict")

  // Cleanup
  await prisma.activationEvent.deleteMany({ where: { qrTokenId: { in: [t1.id, t3.id] } } })
  await prisma.auditLog.deleteMany({ where: { entityType: "QRToken", entityId: { in: [t1.id, t3.id] } } })
  await prisma.package.deleteMany({ where: { qrTokenId: { in: [t1.id, t3.id] } } })
  await prisma.qRToken.deleteMany({ where: { id: { in: [t1.id, t3.id] } } })
  await prisma.routineTemplateDiagnosis.deleteMany({ where: { routineTemplateId: routine.id } })
  await prisma.routineTemplate.delete({ where: { id: routine.id } })
  await prisma.diagnosis.delete({ where: { id: diagnosis.id } })

  console.log(`\nTest run ${exitCode === 0 ? "✅ ALL PASSED" : "❌ SOME FAILED"}`)
  process.exit(exitCode)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
