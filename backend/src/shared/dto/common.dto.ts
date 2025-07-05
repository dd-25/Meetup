import { IsString, IsOptional, IsBoolean, IsNumber, IsObject } from 'class-validator';

// Generic API response wrapper
export class ApiResponseDto<T = any> {
  @IsBoolean()
  success: boolean;

  @IsString()
  message: string;

  @IsOptional()
  data?: T;

  @IsOptional()
  error?: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;

  constructor(success: boolean, message: string, data?: T, error?: string) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.error = error;
    this.timestamp = Date.now();
  }
}

// Success response helper
export class SuccessResponseDto<T = any> extends ApiResponseDto<T> {
  constructor(message: string, data?: T) {
    super(true, message, data);
  }
}

// Error response helper
export class ErrorResponseDto extends ApiResponseDto {
  constructor(message: string, error?: string) {
    super(false, message, undefined, error);
  }
}

// Paginated response
export class PaginatedResponseDto<T = any> {
  @IsObject()
  data: T[];

  @IsNumber()
  total: number;

  @IsNumber()
  page: number;

  @IsNumber()
  limit: number;

  @IsNumber()
  totalPages: number;

  @IsBoolean()
  hasNext: boolean;

  @IsBoolean()
  hasPrev: boolean;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNext = page < this.totalPages;
    this.hasPrev = page > 1;
  }
}

// Query parameters for pagination
export class PaginationQueryDto {
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}

// Health check response
export class HealthCheckResponseDto {
  @IsString()
  status: 'ok' | 'error';

  @IsNumber()
  timestamp: number;

  @IsObject()
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    kafka: 'connected' | 'disconnected';
  };

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsNumber()
  uptime?: number;
}
