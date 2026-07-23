import { ApiRequestError } from '../../lib/api';
import { DeviceActionError } from './device-types';
import { ExecutionOutcomeUnknownError, ExecutionReportPendingError } from './execution-coordinator';

export function actionReviewErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'ACTION_REVISION_CONFLICT') {
      return '这张卡片已在别处更新，请返回刷新后再编辑。';
    }
    return error.message;
  }
  if (
    error instanceof DeviceActionError ||
    error instanceof ExecutionOutcomeUnknownError ||
    error instanceof ExecutionReportPendingError
  ) {
    return error.message;
  }
  return error instanceof Error ? error.message : '操作没有完成，请重试。';
}
