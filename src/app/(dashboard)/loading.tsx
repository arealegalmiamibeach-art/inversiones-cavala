import { CubeLoader } from "@/components/ui/cube-loader";

// Next.js muestra este archivo automáticamente para CUALQUIER navegación
// dentro de (dashboard) mientras el Server Component de destino todavía está
// consultando datos — cubre entidades, procesos, contratos, documentos, etc.
// sin tener que tocar cada página una por una.
export default function DashboardLoading() {
  return <CubeLoader />;
}
