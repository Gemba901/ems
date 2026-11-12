-- CreateTable
CREATE TABLE "LexStrategicDirectionApprover" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexStrategicDirectionApprover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LexStrategicDirectionApprover_organizationId_employeeId_key" ON "LexStrategicDirectionApprover"("organizationId", "employeeId");

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionApprover" ADD CONSTRAINT "LexStrategicDirectionApprover_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionApprover" ADD CONSTRAINT "LexStrategicDirectionApprover_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionApprover" ADD CONSTRAINT "LexStrategicDirectionApprover_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
