export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const errorObj = error as Record<string, unknown>;

    if (typeof errorObj.error === "object" && errorObj.error !== null) {
      const innerError = errorObj.error as Record<string, unknown>;
      if (typeof innerError.message === "string") {
        return innerError.message;
      }
      if (typeof innerError.msg === "string") {
        return innerError.msg;
      }
      try {
        return JSON.stringify(innerError);
      } catch {
        return "Error parsing error details";
      }
    }

    if (typeof errorObj.message === "string") {
      return errorObj.message;
    }

    if (typeof errorObj.msg === "string") {
      return errorObj.msg;
    }

    if (typeof errorObj.error === "string") {
      return errorObj.error;
    }

    try {
      return JSON.stringify(errorObj);
    } catch {
      return "Unknown error";
    }
  }

  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}
