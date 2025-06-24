-- CreateTable
CREATE TABLE "SensorData" (
    "id" SERIAL NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "soilMoisture" DOUBLE PRECISION NOT NULL,
    "waterLevel" DOUBLE PRECISION NOT NULL,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensorData_createdAt_idx" ON "SensorData"("createdAt");
