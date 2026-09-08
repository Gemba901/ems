import type { PrismaService } from 'src/prisma/prisma.service';

// Recheck organization membership at delivery time, including for saved settings.
export async function filterAlertRecipients(
  prisma: PrismaService,
  organizationId: string,
  ids: string[],
): Promise<string[]> {
  if (!ids.length) return [];
  const employees = await prisma.employee.findMany({
    where: { organizationId, id: { in: [...new Set(ids)] } },
    select: { id: true },
  });
  return employees.map((employee) => employee.id);
}
