import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { PrismaService } from '../../prisma/prisma.service';
import { QueryInformeDto } from './dto/query-informe.dto';

export const TIPOS_LISTADO = ['canal-caliente', 'produccion', 'sacrificio', 'proceso-general'] as const;
export type TipoListado = (typeof TIPOS_LISTADO)[number];
const CAMPOS = ['orden', 'cliente', 'fecha', 'estado', 'peso', 'guia', 'animales'] as const;

export class QueryListadoInforme extends QueryInformeDto {
  @IsOptional() @IsString() @MaxLength(200)
  buscar?: string;

  @IsOptional() @IsString() @MaxLength(300)
  cliente?: string;

  @IsOptional() @IsIn(['activo', 'inactivo', 'procesado', 'facturado'])
  estado?: string;

  @IsOptional() @IsIn(CAMPOS)
  ordenar?: (typeof CAMPOS)[number];

  @IsOptional() @IsIn(['asc', 'desc'])
  direccion?: 'asc' | 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  pagina?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limite?: number;
}

export async function consultarListadoInforme(
  prisma: PrismaService, plantId: string, tipo: TipoListado, query: QueryListadoInforme,
  inicio: Date, fin: Date, exportar: boolean,
) {
  const produccion = tipo === 'produccion';
  const caliente = tipo === 'canal-caliente';
  const base = produccion ? Prisma.sql`
    SELECT p.id, p.op_number AS orden, d.od_number AS od, p.process_date AS fecha,
      c.concepto AS cliente, c.id AS cliente_id, c.nit, p.status::text AS estado,
      NULL::text AS destino, ARRAY[]::text[] AS guias, NULL::float8 AS peso,
      0 AS animales, 0 AS sacrificados,
      concat('OD', d.od_number, '-OP', p.op_number, ' ', p.op_number, ' ', d.od_number, ' ', c.concepto, ' ', c.nit) AS texto
    FROM production_order p
    JOIN cliente c ON c.id = p.cliente_id
    JOIN dispatch_order d ON d.id = p.dispatch_order_id
    WHERE p.plant_id = ${plantId}::uuid AND p.deleted_at IS NULL
      AND (p.registration_date BETWEEN ${inicio}::date AND ${fin}::date
        OR p.process_date BETWEEN ${inicio}::date AND ${fin}::date)
  ` : Prisma.sql`
    SELECT o.id, o.reference AS orden, NULL::int AS od, o.date AS fecha,
      o.cliente, NULL::uuid AS cliente_id, NULL::text AS nit, o.status::text AS estado,
      datos.destino, o.guias, datos.peso, o.animal_count AS animales, datos.sacrificados,
      concat('OB', o.reference, ' ', o.reference, ' ', o.cliente, ' ',
        ${caliente ? Prisma.sql`datos.destino` : Prisma.sql`array_to_string(o.guias, ' ')`}) AS texto
    FROM orden_beneficio o
    CROSS JOIN LATERAL (
      SELECT COUNT(DISTINCT e.id)::int AS sacrificados,
        ${caliente ? Prisma.sql`
          string_agg(DISTINCT nullif(btrim(p.destino), ''), ', ') AS destino,
          SUM(p.peso_kg)::float8 AS peso
          FROM orden_beneficio_evento e JOIN canal_pieza p ON p.orden_beneficio_evento_id = e.id
        ` : Prisma.sql`NULL::text AS destino, NULL::float8 AS peso FROM orden_beneficio_evento e`}
      WHERE e.orden_beneficio_id = o.id
    ) datos
    WHERE o.plant_id = ${plantId}::uuid AND o.deleted_at IS NULL
      AND o.date BETWEEN ${inicio}::date AND ${fin}::date
      ${caliente || tipo === 'sacrificio' ? Prisma.sql`AND datos.sacrificados > 0` : Prisma.empty}
  `;
  const campos = {
    orden: produccion ? Prisma.sql`od, orden` : Prisma.sql`orden`,
    cliente: Prisma.sql`lower(cliente)`,
    fecha: Prisma.sql`fecha`,
    estado: Prisma.sql`estado`,
    peso: Prisma.sql`peso`,
    guia: Prisma.sql`guias`,
    animales: Prisma.sql`sacrificados`,
  };
  const direccion = query.direccion === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const ordenSQL = query.ordenar ? Prisma.sql`${query.ordenar === 'orden' && produccion
    ? Prisma.sql`od ${direccion}, orden` : campos[query.ordenar]} ${direccion}, fecha DESC, orden DESC, id`
    : Prisma.sql`fecha DESC, orden DESC, id`;
  const pagina = query.pagina ?? 1;
  const limite = query.limite ?? 20;
  const buscar = query.buscar?.trim();
  const [resultado] = await prisma.$queryRaw<{
    filas: unknown[];
    total: number;
    clientes: string[];
    estados: string[];
    resumen: { procesadas: number; pendientes: number; clientes: number; ordenes: number; peso: number; sacrificados: number };
    pesoFiltrado: number;
  }[]>(Prisma.sql`
    WITH base AS (${base}), filtradas AS (
      SELECT * FROM base WHERE true
      ${buscar ? Prisma.sql`AND strpos(upper(texto), upper(${buscar})) > 0` : Prisma.empty}
      ${query.cliente ? Prisma.sql`AND cliente = ${query.cliente}` : Prisma.empty}
      ${query.estado ? Prisma.sql`AND estado = ${query.estado}` : Prisma.empty}
    ), visibles AS (
      SELECT *, row_number() OVER (ORDER BY ${ordenSQL}) AS posicion FROM filtradas
      ORDER BY ${ordenSQL} ${exportar ? Prisma.empty : Prisma.sql`LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`}
    )
    SELECT coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'reference', orden, 'opNumber', orden, 'odNumber', od, 'cliente', cliente,
      'clienteId', cliente_id, 'clienteNit', nit, 'date', fecha, 'processDate', fecha, 'status', estado,
      'destino', destino, 'guias', guias, 'pesoTotalKg', peso, 'animalCount', animales,
      'sacrificados', sacrificados
    ) ORDER BY posicion) FROM visibles), '[]'::jsonb) AS filas,
    (SELECT COUNT(*)::int FROM filtradas) AS total,
    (SELECT coalesce(SUM(peso), 0)::float8 FROM filtradas) AS "pesoFiltrado",
    (SELECT coalesce(array_agg(DISTINCT cliente ORDER BY cliente) FILTER (WHERE cliente <> ''), ARRAY[]::text[]) FROM base) AS clientes,
    (SELECT coalesce(array_agg(DISTINCT estado ORDER BY estado), ARRAY[]::text[]) FROM base) AS estados,
    (SELECT jsonb_build_object(
      'ordenes', COUNT(*), 'procesadas', COUNT(*) FILTER (WHERE estado IN ('procesado', 'facturado')),
      'pendientes', COUNT(*) FILTER (WHERE estado = 'activo'),
      'clientes', COUNT(DISTINCT coalesce(cliente_id::text, nullif(cliente, ''))),
      'peso', coalesce(SUM(peso), 0), 'sacrificados', coalesce(SUM(sacrificados), 0)
    ) FROM base) AS resumen
  `);
  return resultado;
}
