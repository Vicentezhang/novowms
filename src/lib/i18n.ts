import { useState } from 'react';

export const TEXT = {
  zh: {
    app_title: "NOVO WMS",
    logout: "退出登录",
    
    // 菜单
    menu_receive: "收件入库",
    menu_count: "开箱清点",
    menu_inspect: "质检分级",
    menu_inventory: "库存查询",
    menu_outbound: "发货出库",
    menu_products: "SKU 信息管理",
    menu_users: "用户管理",
    menu_config: "基础配置",
    menu_inbound: "入库单管理", 
    menu_finance: "财务管理", // Added

    // 通用按钮
    btn_submit: "提交",
    btn_save: "保存",
    btn_add: "添加",
    btn_scan: "扫描",
    btn_cancel: "取消",
    btn_delete: "删除",
    btn_edit: "编辑",
    confirm_del: "确认删除吗？",
    required: "必填项不能为空",
    msg_success: "操作成功！",
    msg_error: "发生错误：",
    not_found: "未找到数据",

    // Types
    type_return: "Devolución",
    type_new: "Nuevo",
    type_after_sales: "Post-venta",
    type_blind: "Recepción Ciega",

    // Keyboard
    kb_on: "Teclado ON",
    kb_off: "Teclado OFF",

    // Status
    status_in_transit: "在途",
    status_arrived: "已送达",
    status_received: "已收货",
    status_inspecting: "质检中",
    status_completed: "已完成",

    // Inbound Labels
    lbl_inbound_type: "入库类型",
    lbl_expected_date: "预计发货时间",
    lbl_tracking: "快递单号",
    lbl_remark: "备注信息",
    lbl_actions: "操作",
    lbl_forecast_items: "预报商品信息",
    inbound_edit_title: "编辑入库单",

    // 1. 收件
    recv_tracking: "快递单号",
    recv_scan_ph: "扫描单号...",
    recv_client: "所属货主",
    recv_carrier: "物流渠道",
    recv_type: "包裹类型",
    recv_box: "包裹 (Box)",
    recv_pallet: "卡板 (Pallet)",
    recv_abnormal: "设为异常件",
    recv_reason: "异常原因",
    recv_photo_app: "外观照片",
    recv_photo_wgt: "称重照片",
    recv_receipt: "签收单 (选填)",

    // 2. 清点
    count_scan_pkg: "第一步：扫描包裹",
    count_pkg_info: "当前包裹",
    count_add_sku: "添加商品明细",
    count_qty: "数量",
    count_remark: "备注",
    count_loc: "上架库位",
    count_list: "商品清单",
    count_new: "新品 (良品)",
    count_inspect: "待质检",
    count_receipt_optional: "收到小票信息 (可选)",

    // 3. 质检
    insp_title: "质检工作台",
    insp_scan_ph: "扫描商品条码...",
    insp_item_info: "商品信息",
    insp_type_phone: "手机/平板",
    insp_type_eco: "生态/小家电",
    insp_grade: "成色等级",
    insp_model: "型号",
    insp_color: "颜色",
    insp_memory: "内存",
    insp_imei: "IMEI / SN",
    insp_faults: "故障标签",
    
    // Grades & Faults
    grade_new: "NEW (新品)",
    grade_a: "A级",
    grade_b: "B级",
    grade_c: "C级",
    grade_d: "D级",
    grade_e: "E级",
    
    desc_new: "新品，未拆封，包装完好",
    desc_a: "新机完美，包装拆封，配件完整",
    desc_b: "轻微使用痕迹，屏幕完美",
    desc_c: "明显使用痕迹，功能正常",
    desc_d: "严重外观磨损，功能正常",
    desc_e: "功能故障或报废机",

    fault_charge: "无法充电",
    fault_power: "无法开机",
    fault_pkg: "包装破损",
    fault_access: "缺少配件",
    fault_screen: "屏幕破损",
    fault_camera: "摄像头故障",
    
    // 4. 库存
    inv_total: "总库存概览",
    inv_search_ph: "搜索 SKU / 货主 / 库位...",
    inv_sku: "SKU",
    inv_client: "货主",
    inv_location: "库位",
    inv_qty: "在库数量",

    // 5. SKU 管理
    prod_title: "SKU 产品档案",
    prod_add: "新建 SKU",
    prod_edit: "编辑 SKU",
    prod_dims: "尺寸 (L*W*H)",
    prod_weight: "重量 (kg)",
    prod_sku: "SKU 编码",
    prod_name: "商品名称",
    prod_unit: "单位",
    prod_category: "分类",
    prod_attr: "自定义属性",
    prod_batch_add: "批量添加 SKU",
    prod_download_tmpl: "下载模板",
    prod_import_preview: "预览数据",
    prod_import_confirm: "确认导入",
    prod_import_result: "导入结果",
    prod_import_success: "成功导入：",

    // 6. 出库
    out_title: "创建出库单",
    out_create: "新建出库单",
    out_order_no: "出库单号",
    out_select_client: "选择货主",
    out_stock_check: "库存校验",
    out_stock_fail: "库存不足！剩余: ",
    out_btn_ship: "确认发货 (扣减库存)",
    out_shipped: "已发货",

    // 7. 配置
    config_add: "添加配置",
    config_type: "配置类型",
    config_name: "名称 / 值",
    config_def_loc: "默认库位",
    config_client: "货主",
    config_carrier: "物流商",
    config_brand: "品牌",
    config_cat: "品类",
    
    // 角色
    role_admin: "管理员",
    role_operator: "操作员",
    role_client: "客户",

    // Inbound
    inbound_title: "入库单管理",
    inbound_create: "新增预报",
    inbound_batch: "批量添加",
    inbound_batch_ph: "粘贴Excel数据 (格式: SKU [TAB] 数量)",
    inbound_import_excel: "导入Excel",
    
    // User Management
    user_add: "新增用户",
    user_create_client: "创建客户账号",
    user_name: "用户名",
    user_pass: "密码",
    user_contact: "联系方式",
    user_role: "角色",
    user_role_admin: "管理员",
    user_role_operator: "操作员",
    user_role_client: "客户",
    user_def_loc: "默认库位",
    msg_client_created: "同时创建了同名货主档案",
  },
  es: {
    app_title: "NOVO WMS",
    logout: "Cerrar sesión",
    
    // Menu
    menu_receive: "Recepción",
    menu_count: "Contar",
    menu_inspect: "Verificar (QC)",
    menu_inventory: "Inventario",
    menu_outbound: "Salidas",
    menu_products: "Gestión de SKU",
    menu_users: "Usuarios",
    menu_config: "Configuración",
    menu_inbound: "Entradas",
    menu_finance: "Finanzas", // Added

    // User Management
    user_add: "Añadir Usuario",
    user_create_client: "Crear Cuenta Cliente",
    user_name: "Usuario",
    user_pass: "Contraseña",
    user_contact: "Contacto",
    user_role: "Rol",
    user_role_admin: "Admin",
    user_role_operator: "Operario",
    user_role_client: "Cliente",
    user_def_loc: "Ubicación Predet.",
    msg_client_created: "¡Cuenta de cliente creada!",

    // SKU Batch
    prod_batch_add: "Añadir SKU por Lotes",
    prod_download_tmpl: "Descargar Plantilla",
    prod_import_preview: "Vista Previa",
    prod_import_confirm: "Confirmar Importación",
    prod_import_result: "Resultado",
    prod_import_success: "Importados: ",
    prod_edit: "Editar SKU",
    prod_sku: "Código SKU",
    prod_name: "Nombre",
    prod_unit: "Unidad",
    prod_category: "Categoría",
    prod_attr: "Atributos",

    // General Buttons
    btn_submit: "Enviar",
    btn_save: "Guardar",
    btn_add: "Añadir",
    btn_scan: "Escanear",
    btn_cancel: "Cancelar",
    btn_delete: "Eliminar",
    btn_edit: "Editar",
    confirm_del: "¿Está seguro de eliminar?",
    required: "Campo obligatorio",
    msg_success: "¡Operación exitosa!",
    msg_error: "Error:",
    not_found: "No se encontraron datos",
    
    // Types
    type_return: "Devolución",
    type_new: "Nuevo",
    type_after_sales: "Post-venta",
    type_blind: "Recepción Ciega",

    // Keyboard
    kb_on: "Teclado ON",
    kb_off: "Teclado OFF",

    // Status
    opt_all_status: "Todos los estados",
    status_in_transit: "En Tránsito",
    status_arrived: "Llegado",
    status_received: "Recibido",
    status_inspecting: "Inspeccionando",
    status_completed: "Completado",

    // Inbound Labels
    lbl_inbound_type: "Tipo de Entrada",
    lbl_expected_date: "Fecha Prevista",
    lbl_tracking: "Nº Seguimiento",
    lbl_remark: "Observaciones (Opcional)",
    lbl_inbound_no: "Nº Entrada",
    lbl_created_at: "Fecha Creación",
    lbl_status: "Estado",
    lbl_actions: "Acciones",
    inbound_edit_title: "Editar Entrada",
    btn_submit_inbound: "Enviar Pre-alerta",
    btn_save_changes: "Guardar Cambios",

    // 1. Receive
    recv_tracking: "Nº de Seguimiento",
    recv_scan_ph: "Escanear código...",
    recv_client: "Cliente",
    recv_carrier: "Transportista",
    recv_type: "Tipo de Bulto",
    recv_box: "Caja",
    recv_pallet: "Palet",
    recv_abnormal: "Marcar como incidencia",
    recv_reason: "Motivo de incidencia",
    recv_photo_app: "Foto Estado",
    recv_photo_wgt: "Foto Peso",
    recv_receipt: "Albarán (Opcional)",

    // 2. Count
    count_scan_pkg: "Paso 1: Escanear Paquete",
    count_pkg_info: "Info. del Paquete",
    count_add_sku: "Añadir Artículo",
    count_qty: "Cant.",
    count_remark: "Observaciones",
    count_loc: "Ubicación",
    count_list: "Lista de Artículos",
    count_new: "Nuevo (Conforme)",
    count_inspect: "A Revisión (QC)",
    count_receipt_optional: "Código de albarán (opcional)",

    // 3. Inspect
    insp_title: "Mesa de Control de Calidad",
    insp_scan_ph: "Escanear SKU...",
    insp_item_info: "Detalle del Artículo",
    insp_type_phone: "Móvil/Tablet",
    insp_type_eco: "Eco/IoT",
    insp_grade: "Grado Estético",
    insp_model: "Modelo",
    insp_color: "Color",
    insp_memory: "Memoria",
    insp_imei: "IMEI / SN",
    insp_faults: "Etiquetas de Fallo",
    
    // Grades & Faults
    grade_new: "NUEVO",
    grade_a: "Grado A",
    grade_b: "Grado B",
    grade_c: "Grado C",
    grade_d: "Grado D",
    grade_e: "Grado E",
    
    desc_new: "Nuevo, precintado, embalaje perfecto",
    desc_a: "Como nuevo, desprecintado, accesorios completos",
    desc_b: "Ligeras marcas de uso, pantalla perfecta",
    desc_c: "Marcas de uso evidentes, funcional",
    desc_d: "Desgaste severo, funcional",
    desc_e: "Averiado o para despiece",
    
    fault_charge: "No carga",
    fault_power: "No enciende",
    fault_pkg: "Embalaje dañado",
    fault_access: "Faltan accesorios",
    fault_screen: "Pantalla rota",
    fault_camera: "Fallo cámara",

    // 4. Inventory
    inv_total: "Resumen de Inventario",
    inv_search_ph: "Buscar SKU / Cliente / Ubic...",
    inv_sku: "SKU",
    inv_client: "Cliente",
    inv_location: "Ubicación",
    inv_qty: "Stock Disponible",

    // 5. SKU
    prod_title: "Maestro de Artículos (SKU)",
    prod_add: "Crear SKU",
    prod_dims: "Dimensiones (L*A*A)",
    prod_weight: "Peso (kg)",

    // 6. Outbound
    out_title: "Órdenes de Salida",
    out_create: "Nueva Orden",
    out_order_no: "Nº Orden",
    out_select_client: "Seleccionar Cliente",
    out_stock_check: "Verificar Stock",
    out_stock_fail: "¡Stock insuficiente! Restante: ",
    out_btn_ship: "Confirmar Envío",
    out_shipped: "Enviado",

    // 7. Config
    config_add: "Añadir Config",
    config_type: "Tipo de Configuración",
    config_name: "Nombre / Valor",
    config_def_loc: "Ubic. Predeterminada",
    config_client: "Cliente",
    config_carrier: "Transportista",
    config_brand: "Marca",
    config_cat: "Categoría",
    
    // Roles
    role_admin: "Administrador",
    role_operator: "Operario",
    role_client: "Cliente",
    
    // Inbound
    inbound_title: "Gestión de Entradas",
    inbound_create: "Nueva Pre-alerta",
    inbound_batch: "Añadir por Lotes",
    inbound_batch_ph: "Pegar datos Excel (SKU [TAB] Cantidad)",
    inbound_import_excel: "Importar Excel",

    // Reports
    rpt_title: "Informe de Calidad",
    rpt_stats: "Estadísticas de Resultados",
    rpt_top_faults: "Top 5 Fallos Frecuentes",
    rpt_pass_rate: "Tasa de Aprobación",
    rpt_export_pdf: "Exportar Informe PDF",
  }
};

export const useTranslation = () => {
  const [lang, setLang] = useState(localStorage.getItem('app_lang') || 'zh');
  const changeLang = (l: string) => {
    localStorage.setItem('app_lang', l);
    setLang(l);
    window.location.reload(); 
  };
  const t = (k: string) => (TEXT as any)[lang]?.[k] || k;
  return { t, lang, changeLang };
};
