export type Rol = "admin" | "oficina" | "tecnico";
export type EstadoVisita = "programada" | "realizada" | "cancelada";
export type UnidadFrecuencia = "dias" | "semanas" | "meses" | "unica";

export type Perfil = {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
};

export type Region = { id: string; nombre: string };
export type Zona = { id: string; region_id: string; nombre: string };

export type Servicio = {
  id: string;
  nombre: string;
  precio_base: number;
  garantia_meses: number | null;
  instrucciones: string | null;
  activo: boolean;
};

export type Motivo = { id: string; nombre: string; activo: boolean };

export type Cliente = {
  id: string;
  nombre: string; // nombre comercial
  razon_social: string | null; // nombre de facturación
  rnc: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  activo: boolean;
  // Facturación
  tipo_comprobante?: string | null;
  dias_credito?: number;
  correo_facturas?: string | null;
  exento_itbis?: boolean;
  limite_credito?: number | null;
  generico?: boolean;
  moneda?: "DOP" | "USD" | "EUR";
};

export type Sucursal = {
  id: string;
  cliente_id: string;
  nombre: string;
  direccion: string | null;
  zona_id: string | null;
  contacto_nombre: string | null;
  contacto_whatsapp: string | null;
  servicio_id: string | null;
  precio: number | null;
  frecuencia_unidad: UnidadFrecuencia;
  frecuencia_cada: number;
  dia_mes: number | null;
  dia_semana: number | null;
  fecha_inicio: string;
  tecnico_id: string | null;
  activa: boolean;
  notas: string | null;
};

export type VisitaDetalle = {
  id: string;
  sucursal_id: string;
  servicio_id: string | null;
  tecnico_id: string | null;
  fecha: string;
  precio: number | null;
  estado: EstadoVisita;
  origen: "frecuencia" | "reprogramada" | "manual";
  reprograma_a: string | null;
  realizada_en: string | null;
  motivo_cancelacion_id: string | null;
  cancelada_en: string | null;
  notas_tecnico: string | null;
  sucursal: string;
  direccion: string | null;
  notas_sucursal: string | null;
  contacto_nombre: string | null;
  contacto_whatsapp: string | null;
  cliente_id: string;
  cliente: string;
  zona_id: string | null;
  zona: string | null;
  region_id: string | null;
  region: string | null;
  servicio: string | null;
  instrucciones: string | null;
  tecnico: string | null;
  motivo_cancelacion: string | null;
  por_reprogramar: boolean;
};

export type GarantiaDetalle = {
  id: string;
  visita_id: string;
  sucursal_id: string;
  inicio: string;
  vence: string;
  sucursal: string;
  cliente_id: string;
  cliente: string;
  servicio: string | null;
  vigente: boolean;
};

/** Resultado de una acción de formulario */
export type Resultado = { ok?: string; error?: string } | null;

export type Producto = {
  id: string;
  nombre: string;
  ingrediente_activo: string | null;
  unidad: string;
  registro: string | null;
  activo: boolean;
  // Inventario y venta
  precio_venta?: number;
  costo?: number;
  existencia?: number;
  minimo?: number;
  se_vende?: boolean;
  itbis_tasa?: number;
};

export type Empresa = {
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  whatsapp: string | null;
  correo: string | null;
  direccion: string | null;
  licencia: string | null;
  pie_constancia: string | null;
  mensaje_ticket?: string | null;
  bloquear_credito?: boolean;
};

export type ProductoAplicado = {
  producto_id: string;
  nombre: string;
  ingrediente_activo: string | null;
  registro?: string | null;
  cantidad: string | null;
  unidad: string;
};

/** Lo que devuelve constancia_publica() */
export type ConstanciaPublica = {
  token: string;
  numero: string;
  recibido_por: string | null;
  recibido_cargo: string | null;
  plagas: string[];
  areas: string | null;
  productos: ProductoAplicado[];
  fotos: string[];
  firma: string | null;
  fecha: string;
  realizada_en: string | null;
  notas: string | null;
  cliente: string;
  razon_social: string | null;
  cliente_rnc: string | null;
  sucursal: string;
  direccion: string | null;
  zona: string | null;
  region: string | null;
  servicio: string | null;
  tecnico: string | null;
  garantia_vence: string | null;
  empresa: Empresa;
};

export const PLAGAS = ["Cucarachas", "Roedores", "Hormigas", "Mosquitos", "Moscas", "Termitas", "Arañas", "Chinches", "Pulgas", "Alacranes"];

// ---------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------
export type TipoDocumento = "proforma" | "factura" | "nota_credito";
export type EstadoDocumento = "borrador" | "emitida" | "anulada";
export type EstadoEcf = "no_aplica" | "pendiente" | "enviado" | "aceptado" | "condicional" | "rechazado";

export type TipoComprobante = { codigo: string; nombre: string; serie: "B" | "E"; es_nota_credito: boolean; requiere_rnc: boolean };

export type Factura = {
  id: string;
  tipo_doc: TipoDocumento;
  tipo_ncf: string | null;
  ncf: string | null;
  ncf_vence: string | null;
  numero_proforma: string | null;
  cliente_id: string;
  cliente_nombre: string | null;
  razon_social: string | null;
  rnc: string | null;
  fecha: string;
  vence: string | null;
  dias_credito: number;
  estado: EstadoDocumento;
  estado_ecf: EstadoEcf;
  ecf_mensaje: string | null;
  referencia_id: string | null;
  proforma_id: string | null;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  notas: string | null;
  motivo_anulacion: string | null;
  token: string;
  creado_en: string;
  emitida_en: string | null;
  nc_aplicada?: number;
  reembolso?: Reembolso;
  reembolso_monto?: number;
  devuelve_inventario?: boolean;
  venta_rapida?: boolean;
  moneda?: "DOP" | "USD" | "EUR";
  tasa_cambio?: number;
};

export type Reembolso = "saldo" | "efectivo" | "transferencia" | "cheque" | "tarjeta";

export type LineaFactura = {
  id?: string;
  orden?: number;
  descripcion: string;
  servicio_id: string | null;
  visita_id: string | null;
  producto_id?: string | null;
  cantidad: number;
  precio: number;
  descuento: number;
  itbis_tasa: number;
  subtotal?: number;
  itbis?: number;
};

export type Secuencia = {
  id: string;
  tipo: string;
  nombre: string;
  serie: "B" | "E";
  desde: number;
  hasta: number;
  siguiente: number;
  vence: string | null;
  activa: boolean;
  primero: string;
  ultimo: string;
  disponibles: number;
  estado: "vigente" | "por_agotarse" | "agotada" | "vencida" | "inactiva";
};

export type VisitaPorFacturar = {
  id: string;
  fecha: string;
  precio: number | null;
  servicio_id: string | null;
  sucursal_id: string;
  sucursal: string;
  cliente_id: string;
  cliente: string;
  servicio: string | null;
  exento_itbis: boolean;
};

export type FormaPago = "efectivo" | "transferencia" | "tarjeta" | "cheque" | "saldo_favor" | "otro";

export type EstadoPago = "pendiente" | "parcial" | "pagada" | "vencida";

export type FacturaCobro = {
  id: string;
  cliente_id: string;
  ncf: string;
  tipo_ncf: string;
  fecha: string;
  vence: string | null;
  dias_credito: number;
  total: number;
  token: string;
  moneda: "DOP" | "USD" | "EUR";
  tasa_cambio: number;
  saldo_dop: number;
  cliente: string;
  rnc: string | null;
  venta_rapida: boolean;
  cobrado: number;
  acreditado: number;
  saldo: number;
  estado_pago: EstadoPago;
  dias_vencida: number;
};

export type ClienteCuenta = {
  id: string;
  nombre: string;
  razon_social: string | null;
  rnc: string | null;
  telefono: string | null;
  dias_credito: number;
  limite_credito: number | null;
  pendiente: number;
  por_vencer: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
  facturas_pendientes: number;
  max_dias_vencida: number | null;
  saldo_favor: number;
};

export type Cobro = {
  id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  total: number;
  cambio: number;
  moneda?: "DOP" | "USD" | "EUR";
  tasa_cambio?: number;
  notas: string | null;
  estado: "activo" | "anulado";
  motivo_anulacion: string | null;
  creado_en: string;
};

export type PagoCobro = { forma: FormaPago; monto: number; referencia: string | null };
