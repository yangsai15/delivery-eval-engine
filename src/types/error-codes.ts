export enum ErrorCode {
  // E1001-E1099: 参数校验错误
  E1001 = 'E1001', // 项目名称为空
  E1002 = 'E1002', // 项目名称重复
  E1003 = 'E1003', // 数据量必须>0
  E1004 = 'E1004', // 有效率超出范围
  E1005 = 'E1005', // 人效目标必须>0
  E1006 = 'E1006', // 配置人数必须≥1
  E1007 = 'E1007', // 日期范围无效
  E1008 = 'E1008', // 流转间隔精度不符
  E1009 = 'E1009', // 分阶段覆盖不完整
  E1010 = 'E1010', // 加班日期超出项目周期
  E1011 = 'E1011', // 流程模式不匹配
  E1012 = 'E1012', // 人数过大提醒
  E1013 = 'E1013', // 数据量过大提醒

  // E2001-E2099: 计算引擎错误
  E2001 = 'E2001', // 测算超时
  E2002 = 'E2002', // 项目不可行（间隔≥周期）
  E2003 = 'E2003', // 零交付结果
  E2004 = 'E2004', // 数值溢出
  E2005 = 'E2005', // 参数未配置完整

  // E3001-E3099: 安全与加密错误
  E3001 = 'E3001', // 密码验证失败
  E3002 = 'E3002', // 账户已锁定
  E3003 = 'E3003', // 恢复密钥文件无效
  E3004 = 'E3004', // 数据库解密失败
  E3005 = 'E3005', // 备份文件校验失败

  // E4001-E4099: 数据存储错误
  E4001 = 'E4001', // 数据库写入失败
  E4002 = 'E4002', // 磁盘空间不足
  E4003 = 'E4003', // 数据库文件损坏
  E4004 = 'E4004', // 并发写入冲突
  E4005 = 'E4005', // 导入版本不兼容

  // E5001-E5099: 文件操作错误
  E5001 = 'E5001', // 导出路径无权限
  E5002 = 'E5002', // 文件已被占用
  E5003 = 'E5003', // 模板解析失败
  E5004 = 'E5004', // 备份文件格式错误
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.E1001]: '项目名称不可为空',
  [ErrorCode.E1002]: '项目名称已存在，请使用其他名称',
  [ErrorCode.E1003]: '总数据量必须大于0',
  [ErrorCode.E1004]: '有效率取值范围必须在(0%, 100%]之间',
  [ErrorCode.E1005]: '人效目标必须大于0',
  [ErrorCode.E1006]: '配置人数必须≥1',
  [ErrorCode.E1007]: '日期范围无效，结束日期必须≥开始日期',
  [ErrorCode.E1008]: '流转间隔精度不符，须为0.5的倍数',
  [ErrorCode.E1009]: '分阶段时间覆盖不完整，各阶段须连续覆盖项目完整周期',
  [ErrorCode.E1010]: '加班日期必须在项目周期范围内',
  [ErrorCode.E1011]: '角色/流转配置与流程模式不匹配',
  [ErrorCode.E1012]: '人数较大，请确认输入正确',
  [ErrorCode.E1013]: '数据量较大，计算可能需要较长时间',
  [ErrorCode.E2001]: '测算超时，请减少数据量或简化配置后重试',
  [ErrorCode.E2002]: '项目不可行：流转间隔之和≥项目周期',
  [ErrorCode.E2003]: '当前配置下无法产生任何有效交付',
  [ErrorCode.E2004]: '计算过程中出现数值溢出',
  [ErrorCode.E2005]: '参数未配置完整，无法执行测算',
  [ErrorCode.E3001]: '密码验证失败',
  [ErrorCode.E3002]: '账户已锁定，请稍后重试',
  [ErrorCode.E3003]: '恢复密钥文件无效',
  [ErrorCode.E3004]: '数据库解密失败',
  [ErrorCode.E3005]: '备份文件校验失败',
  [ErrorCode.E4001]: '数据库写入失败',
  [ErrorCode.E4002]: '磁盘空间不足',
  [ErrorCode.E4003]: '数据库文件损坏',
  [ErrorCode.E4004]: '并发写入冲突',
  [ErrorCode.E4005]: '备份文件版本不兼容',
  [ErrorCode.E5001]: '导出路径无权限',
  [ErrorCode.E5002]: '文件已被占用',
  [ErrorCode.E5003]: '模板解析失败',
  [ErrorCode.E5004]: '备份文件格式错误',
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly detail?: string;

  constructor(code: ErrorCode, detail?: string) {
    super(ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}
