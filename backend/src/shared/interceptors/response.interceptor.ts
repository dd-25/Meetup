import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiResponseDto, ErrorResponseDto } from '../dto';
import { ERROR_MESSAGES } from '../constants';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(
        map(data => {
          // If the response is already wrapped, return it as is
          if (data instanceof ApiResponseDto) {
            return data;
          }
          
          // Wrap successful responses
          return new ApiResponseDto(true, 'Operation successful', data);
        }),
        catchError(error => {
          this.logger.error('Request failed:', error);
          
          // Handle known HTTP exceptions
          if (error instanceof HttpException) {
            const status = error.getStatus();
            const message = error.message || ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
            
            return throwError(() => new HttpException(
              new ErrorResponseDto(message, error.getResponse() as string),
              status
            ));
          }
          
          // Handle unknown errors
          return throwError(() => new HttpException(
            new ErrorResponseDto(
              ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
              process.env.NODE_ENV === 'development' ? error.message : undefined
            ),
            HttpStatus.INTERNAL_SERVER_ERROR
          ));
        })
      );
  }
}
