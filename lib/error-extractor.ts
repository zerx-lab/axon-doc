export interface ExtractedError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: string;
}

export function extractErrorMessage(error: unknown): string {
  const extracted = extractDetailedError(error);
  return extracted.message;
}

function ensureString(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 0 ? value : "Unknown error";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  
  if (typeof value === "object") {
    if (value instanceof Error) {
      return ensureString(value.message);
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}" && json !== "{}[]" && json !== "[object Object]") {
        return json;
      }
    } catch {
      // JSON 序列化失败，继续
    }
  }
  
  try {
    const str = String(value);
    if (str && str !== "[object Object]") return str;
  } catch {
    // String 转换失败
  }
  
  return "Unknown error";
}

export function extractDetailedError(error: unknown): ExtractedError {
  if (error instanceof Error) {
    const errorObj = error as unknown as Record<string, unknown>;
    
    let message = ensureString(error.message);
    let code = errorObj.constructor?.name as string || "Error";
    const statusCode = errorObj.statusCode as number | undefined;
    let details: string | undefined;

    if (typeof errorObj.responseBody === "string") {
      try {
        const responseBody = JSON.parse(errorObj.responseBody);
        if (responseBody.error) {
          const errorInfo = responseBody.error as Record<string, unknown>;
          message = ensureString(errorInfo.message || errorInfo.type || error.message);
          code = ensureString(errorInfo.code || errorInfo.type || code);
          details = `${ensureString(errorInfo.type || "")}${statusCode ? ` (HTTP ${statusCode})` : ""}`;
          return { message, code, statusCode, details };
        }
      } catch {
        // responseBody 解析失败，继续用原始错误信息
      }
    }

    return {
      message: message || "Unknown error",
      code,
      statusCode,
      details,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;

    if (typeof errorObj.responseBody === "string") {
      try {
        const responseBody = JSON.parse(errorObj.responseBody);
        if (responseBody.error) {
          const errorInfo = responseBody.error as Record<string, unknown>;
          return {
            message: ensureString(errorInfo.message || errorInfo.type || "Unknown error"),
            code: ensureString(errorInfo.code || errorInfo.type),
            statusCode: errorObj.statusCode as number,
            details: ensureString(errorInfo.type || ""),
          };
        }
      } catch {
        // 继续其他处理
      }
    }

    if (typeof errorObj.error === "object" && errorObj.error !== null) {
      const innerError = errorObj.error as Record<string, unknown>;
      if (typeof innerError.message === "string") {
        return {
          message: innerError.message,
          code: ensureString(innerError.code || errorObj.code),
          statusCode: errorObj.statusCode as number,
        };
      }
      if (typeof innerError.msg === "string") {
        return { message: innerError.msg };
      }
    }

    if (typeof errorObj.message === "string") {
      return {
        message: errorObj.message,
        code: ensureString(errorObj.code),
        statusCode: errorObj.statusCode as number,
      };
    }

    if (typeof errorObj.msg === "string") {
      return { message: errorObj.msg };
    }

    if (typeof errorObj.error === "string") {
      return { message: errorObj.error };
    }

    return { message: ensureString(errorObj) };
  }

  return { message: ensureString(error) };
}
