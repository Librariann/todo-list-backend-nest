export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  timestamp: string;
}

export function success<T>(
  data: T,
  message = "요청이 성공적으로 처리되었습니다.",
): ApiResponse<T> {
  return { success: true, message, data, timestamp: new Date().toISOString() };
}

export function error(
  message: string,
  data: unknown = null,
): ApiResponse<unknown> {
  return { success: false, message, data, timestamp: new Date().toISOString() };
}
