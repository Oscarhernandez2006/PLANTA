import { MonitorSmartphone, Warehouse, FileBarChart, Package, Snowflake, Users, Factory, Puzzle, ArrowLeftRight, Truck, PackageCheck, Container, ThermometerSun, ThermometerSnowflake, Beef, SlidersHorizontal, ShieldCheck, UserCog } from 'lucide-react';
import { CanalFriaIcon } from '@/components/icons/CanalFriaIcon';
import { CanalReciboIcon } from '@/components/icons/CanalReciboIcon';
import { PostaReciboIcon } from '@/components/icons/PostaReciboIcon';
import { CanalCalienteIcon } from '@/components/icons/CanalCalienteIcon';
import { PesoEnCamionIcon } from '@/components/icons/PesoEnCamionIcon';
import { PesoEnPieIcon } from '@/components/icons/PesoEnPieIcon';
import { ReciboCanalesIcon } from '@/components/icons/ReciboCanalesIcon';
import { SacrificioIcon } from '@/components/icons/SacrificioIcon';
import { PielesIcon } from '@/components/icons/PielesIcon';
import { SubproductosIcon } from '@/components/icons/SubproductosIcon';
import { OrdenBeneficioIcon } from '@/components/icons/OrdenBeneficioIcon';
import { OrdenDespachoFrioIcon } from '@/components/icons/OrdenDespachoFrioIcon';
import { RotuladoDesposteIcon } from '@/components/icons/RotuladoDesposteIcon';
import { RotuladoAcondicionamientoIcon } from '@/components/icons/RotuladoAcondicionamientoIcon';

export type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Módulos del menú lateral, por grupo. La ruta (`to`) es también la clave del
 * permiso de cada módulo (Configuración → Permisos).
 */
export const navGroups: NavGroup[] = [
  {
    title: 'Recibo de Materia Prima',
    items: [
      { to: '/peso-en-camion', label: 'Peso En Camión', icon: PesoEnCamionIcon },
      { to: '/peso-en-pie', label: 'Peso En Pie', icon: PesoEnPieIcon },
      { to: '/recibo-de-canales', label: 'Recibo de Canales', icon: ReciboCanalesIcon },
      { to: '/recibo-en-posta', label: 'Recibo en Posta', icon: PostaReciboIcon },
    ],
  },
  {
    title: 'Beneficio',
    items: [
      { to: '/sacrificio', label: 'Sacrificio', icon: SacrificioIcon },
      { to: '/pieles', label: 'Pieles', icon: PielesIcon },
      { to: '/subproductos', label: 'Subproductos', icon: SubproductosIcon },
      { to: '/canal-caliente', label: 'Canal Caliente', icon: CanalCalienteIcon },
    ],
  },
  {
    title: 'Rotulado',
    items: [
      { to: '/rotulado-desposte', label: 'Rotulado Desposte', icon: RotuladoDesposteIcon },
      { to: '/rotulado-acondicionamiento', label: 'Rotulado Acondicionamiento', icon: RotuladoAcondicionamientoIcon },
    ],
  },
  {
    title: 'Gestión de inventarios',
    items: [
      { to: '/inventarios', label: 'Inventarios', icon: Warehouse },
      { to: '/productos', label: 'Productos', icon: Package },
      { to: '/conservacion', label: 'Conservación', icon: Snowflake },
    ],
  },
  {
    title: 'Logística',
    items: [
      { to: '/canal-fria', label: 'Canal Fría', icon: CanalFriaIcon },
      { to: '/traslado', label: 'Traslado', icon: Truck },
      { to: '/despacho-caliente', label: 'Despacho Caliente', icon: ThermometerSun },
      { to: '/despacho-frio', label: 'Despacho Frío', icon: ThermometerSnowflake },
      { to: '/despacho-posta', label: 'Despacho Posta', icon: Beef },
    ],
  },
  {
    title: 'Gestor de órdenes',
    items: [
      { to: '/orden-beneficio', label: 'Orden de Beneficio', icon: OrdenBeneficioIcon },
      { to: '/orden-despacho', label: 'Orden de Despacho a Proceso', icon: OrdenDespachoFrioIcon },
      { to: '/despacho-canales', label: 'Órdenes Despacho Canales', icon: Container },
      { to: '/orden-traslado', label: 'Orden de Traslado', icon: ArrowLeftRight },
      { to: '/orden-produccion', label: 'Órdenes de Producción', icon: Factory },
      { to: '/orden-acondicionamiento', label: 'Órdenes de Acondicionamiento', icon: PackageCheck },
      { to: '/recibo-canal', label: 'Orden recibo de canales', icon: CanalReciboIcon },
      { to: '/recibo-posta', label: 'Orden recibo en posta', icon: PostaReciboIcon },
    ],
  },
  {
    title: 'Gestión de Terceros',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/piezas-desposte', label: 'Piezas Desposte', icon: Puzzle },
      { to: '/informes', label: 'Informes', icon: FileBarChart },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { to: '/configuracion/estaciones', label: 'Estaciones', icon: MonitorSmartphone },
      { to: '/configuracion/parametros-estacion', label: 'Parámetros estación', icon: SlidersHorizontal },
      { to: '/configuracion/usuarios', label: 'Usuarios', icon: UserCog },
      { to: '/configuracion/permisos', label: 'Permisos', icon: ShieldCheck },
    ],
  },
];
