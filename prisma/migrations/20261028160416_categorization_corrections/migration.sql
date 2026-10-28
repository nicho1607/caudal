-- CreateTable
CREATE TABLE "categorization_corrections" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "payeeNormalized" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorization_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categorization_corrections_userId_payeeNormalized_categoryI_idx" ON "categorization_corrections"("userId", "payeeNormalized", "categoryId");

-- AddForeignKey
ALTER TABLE "categorization_corrections" ADD CONSTRAINT "categorization_corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_corrections" ADD CONSTRAINT "categorization_corrections_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
