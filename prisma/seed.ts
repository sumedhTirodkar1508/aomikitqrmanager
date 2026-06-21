import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  StepType,
  BatchSource,
  QRTokenStatus,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg(process.env.DIRECT_URL!);
const prisma = new PrismaClient({ adapter });

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (isProduction && process.env.ALLOW_DEV_SEED !== "true") {
    console.error("🛑 Refusing to run seed script in production environment.");
    console.error("If you truly need to run this seed in production, set ALLOW_DEV_SEED=true.");
    console.error("Note: For Phase 1, production admins should be created via controlled manual bootstrap.");
    process.exit(1);
  }

  console.log("🌱 Seeding database...");

  // ── Users ─────────────────────────────────────────────────────────────────

  const adminPlainPassword = requiredEnv("SEED_ADMIN_PASSWORD");
  const sellerPlainPassword = requiredEnv("SEED_SELLER_PASSWORD");

  const adminPassword = await bcrypt.hash(adminPlainPassword, 12);
  const sellerPassword = await bcrypt.hash(sellerPlainPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@aomi.internal" },
    update: {
      name: "AOMI Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      name: "AOMI Admin",
      email: "admin@aomi.internal",
      passwordHash: adminPassword,
      role: "ADMIN",
      isActive: true,
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: "seller@aomi.internal" },
    update: {
      name: "AOMI Seller",
      passwordHash: sellerPassword,
      role: "SELLER",
      isActive: true,
    },
    create: {
      name: "AOMI Seller",
      email: "seller@aomi.internal",
      passwordHash: sellerPassword,
      role: "SELLER",
      isActive: true,
    },
  });

  console.log(`  ✓ Users: ${admin.email} (ADMIN), ${seller.email} (SELLER)`);

  // ── Diagnoses ─────────────────────────────────────────────────────────────

  const diagnosisData = [
    {
      name: "Oily Skin",
      slug: "oily-skin",
      description: "Excess sebum production",
    },
    { name: "Pores", slug: "pores", description: "Enlarged or clogged pores" },
    {
      name: "Dark Spots",
      slug: "dark-spots",
      description: "Hyperpigmentation and uneven tone",
    },
    {
      name: "Sensitive Skin",
      slug: "sensitive-skin",
      description: "Easily irritated skin",
    },
    {
      name: "Hydration",
      slug: "hydration",
      description: "Dry or dehydrated skin",
    },
    {
      name: "Mixed Skin",
      slug: "mixed-skin",
      description: "Combination of oily and dry zones",
    },
  ];

  for (const d of diagnosisData) {
    await prisma.diagnosis.upsert({
      where: { slug: d.slug },
      update: {
        name: d.name,
        description: d.description,
        active: true,
      },
      create: {
        ...d,
        active: true,
      },
    });
  }

  const diagnoses = await prisma.diagnosis.findMany();
  console.log(`  ✓ Diagnoses: ${diagnoses.length} created`);

  // ── Routine Types ─────────────────────────────────────────────────────────

  const routineTypeData = [
    { name: "Morning Routine", slug: "morning-routine" },
    { name: "Night Routine", slug: "night-routine" },
    { name: "Weekly Routine", slug: "weekly-routine" },
  ];

  for (const rt of routineTypeData) {
    await prisma.routineType.upsert({
      where: { slug: rt.slug },
      update: {
        name: rt.name,
        active: true,
      },
      create: {
        ...rt,
        active: true,
      },
    });
  }

  const morningType = await prisma.routineType.findUnique({
    where: { slug: "morning-routine" },
  });

  console.log(`  ✓ Routine types: ${routineTypeData.length} created`);

  // ── Products ──────────────────────────────────────────────────────────────

  const productData = [
    {
      sku: "AOMI-CLN-001",
      name: "Gentle Foaming Cleanser",
      category: "Cleanser",
      functionDescription: "Removes impurities without stripping moisture",
      stepType: StepType.CLEANSER,
    },
    {
      sku: "AOMI-TNR-001",
      name: "Balancing Toner",
      category: "Toner",
      functionDescription: "Restores skin pH and preps for serums",
      stepType: StepType.TONER,
    },
    {
      sku: "AOMI-SRM-001",
      name: "Niacinamide Serum 10%",
      category: "Serum",
      functionDescription: "Minimizes pores and controls oil",
      stepType: StepType.SERUM,
    },
    {
      sku: "AOMI-SRM-002",
      name: "Vitamin C Brightening Serum",
      category: "Serum",
      functionDescription: "Fades dark spots and evens skin tone",
      stepType: StepType.SERUM,
    },
    {
      sku: "AOMI-CRM-001",
      name: "Oil-Free Moisturizer",
      category: "Moisturizer",
      functionDescription: "Lightweight hydration for oily skin",
      stepType: StepType.MOISTURIZER,
    },
    {
      sku: "AOMI-SPF-001",
      name: "SPF 50 Sunscreen",
      category: "Sunscreen",
      functionDescription: "Broad-spectrum UV protection",
      stepType: StepType.SUNSCREEN,
    },
  ];

  const createdProducts: Record<string, string> = {};

  for (const p of productData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        category: p.category,
        functionDescription: p.functionDescription,
        stepType: p.stepType,
        active: true,
      },
      create: {
        ...p,
        active: true,
      },
    });
    createdProducts[p.sku] = product.id;
  }

  console.log(`  ✓ Products: ${productData.length} created`);

  // ── Sample Replacement Rule ───────────────────────────────────────────────

  const serum1Id = createdProducts["AOMI-SRM-001"];
  const serum2Id = createdProducts["AOMI-SRM-002"];

  if (serum1Id && serum2Id) {
    await prisma.productReplacement.upsert({
      where: {
        sourceProductId_replacementProductId: {
          sourceProductId: serum1Id,
          replacementProductId: serum2Id,
        },
      },
      update: {
        stepType: StepType.SERUM,
        active: true,
      },
      create: {
        sourceProductId: serum1Id,
        replacementProductId: serum2Id,
        stepType: StepType.SERUM,
        active: true,
      },
    });

    console.log(`  ✓ Replacement rule: Niacinamide Serum → Vitamin C Serum`);
  }

  // ── Routine Template: Oily Skin Morning Routine ───────────────────────────

  if (!morningType) throw new Error("Morning routine type not found");

  const oilyDiagnosis = await prisma.diagnosis.findUnique({
    where: { slug: "oily-skin" },
  });
  const poresDiagnosis = await prisma.diagnosis.findUnique({
    where: { slug: "pores" },
  });

  if (!oilyDiagnosis || !poresDiagnosis) {
    throw new Error("Required diagnoses not found");
  }

  const existingTemplate = await prisma.routineTemplate.findFirst({
    where: { name: "Oily Skin + Pores Morning Routine" },
  });

  if (!existingTemplate) {
    const template = await prisma.routineTemplate.create({
      data: {
        name: "Oily Skin + Pores Morning Routine",
        description:
          "A balanced morning routine targeting oily skin and enlarged pores",
        durationDays: 20,
        routineTypeId: morningType.id,
        generalInstructions:
          "Apply each product in order, waiting 30 seconds between steps. Use SPF every morning without exception.",
        diagnoses: {
          create: [
            { diagnosisId: oilyDiagnosis.id },
            { diagnosisId: poresDiagnosis.id },
          ],
        },
        steps: {
          create: [
            {
              stepNumber: 1,
              stepType: StepType.CLEANSER,
              defaultProductId: createdProducts["AOMI-CLN-001"],
              instruction:
                "Apply to damp skin, massage for 60 seconds, rinse thoroughly.",
            },
            {
              stepNumber: 2,
              stepType: StepType.TONER,
              defaultProductId: createdProducts["AOMI-TNR-001"],
              instruction:
                "Apply to a cotton pad and sweep gently across face.",
            },
            {
              stepNumber: 3,
              stepType: StepType.SERUM,
              defaultProductId: createdProducts["AOMI-SRM-001"],
              instruction: "Apply 3–4 drops to face and neck, pat in gently.",
            },
            {
              stepNumber: 4,
              stepType: StepType.MOISTURIZER,
              defaultProductId: createdProducts["AOMI-CRM-001"],
              instruction: "Apply a pea-sized amount evenly across face.",
            },
            {
              stepNumber: 5,
              stepType: StepType.SUNSCREEN,
              defaultProductId: createdProducts["AOMI-SPF-001"],
              instruction:
                "Apply generously as the last step. Reapply every 2 hours outdoors.",
            },
          ],
        },
      },
    });

    console.log(`  ✓ Routine template: "${template.name}" with 5 steps`);
  } else {
    console.log(`  ↩ Routine template already exists, skipping`);
  }

  // ── Sample QR Token Batch ─────────────────────────────────────────────────

  const existingBatch = await prisma.qRTokenBatch.findFirst({
    where: { batchName: "Sample Batch 001" },
  });

  if (!existingBatch) {
    const sampleTokens = [
      "AOMI-KIT-SEED01",
      "AOMI-KIT-SEED02",
      "AOMI-KIT-SEED03",
    ];

    const batch = await prisma.qRTokenBatch.create({
      data: {
        batchName: "Sample Batch 001",
        prefix: "AOMI-KIT",
        quantity: sampleTokens.length,
        source: BatchSource.GENERATED,
        createdByUserId: admin.id,
        tokens: {
          create: sampleTokens.map((token) => ({
            token,
            status: QRTokenStatus.AVAILABLE,
            generatedByUserId: admin.id,
          })),
        },
      },
    });

    console.log(
      `  ✓ QR batch: "${batch.batchName}" with ${sampleTokens.length} tokens`,
    );
  } else {
    console.log(`  ↩ Sample QR batch already exists, skipping`);
  }

  console.log("\n✅ Seed complete.");
  console.log(
    "   Admin login:  admin@aomi.internal / value from SEED_ADMIN_PASSWORD",
  );
  console.log(
    "   Seller login: seller@aomi.internal / value from SEED_SELLER_PASSWORD",
  );
  console.log("   ⚠️  Change these passwords before production use.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
