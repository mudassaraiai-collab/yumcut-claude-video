import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatDateTimeAdmin } from '@/lib/date';
import type { AdminTransactionListItem } from '@/server/admin/transactions';

const PROJECT_TITLE_PREVIEW_MAX = 63;

function transactionTypeLabel(type: string) {
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function truncatePreview(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

type AdminTransactionCardProps = {
  transaction: AdminTransactionListItem;
};

export function AdminTransactionCard({ transaction }: AdminTransactionCardProps) {
  const positive = transaction.delta >= 0;
  const reason = transaction.description?.trim() || transactionTypeLabel(transaction.type);

  return (
    <div
      className={`rounded-lg border p-4 ${positive ? 'border-emerald-200/70 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-rose-200/70 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant={positive ? 'success' : 'danger'} className="mb-2">
            {transactionTypeLabel(transaction.type)}
          </Badge>
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {positive ? '+' : '-'}{Math.abs(transaction.delta).toLocaleString()} tokens
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Balance after: {transaction.balanceAfter.toLocaleString()}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400">
          <div>{formatDateTimeAdmin(transaction.createdAt)}</div>
          {transaction.initiator ? (
            <div className="mt-1">Initiator: <span className="font-medium text-gray-700 dark:text-gray-200">{transaction.initiator}</span></div>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
        Reason: {reason}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          User:{' '}
          <Link
            href={`/admin/users/${transaction.user.id}`}
            className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-900 dark:text-gray-200 dark:decoration-gray-700 dark:hover:text-gray-100"
          >
            {transaction.user.name || transaction.user.email}
          </Link>
        </span>
        {transaction.project ? (
          <span>
            Project:{' '}
            <Link
              href={`/admin/projects/${transaction.project.id}`}
              className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-900 dark:text-gray-200 dark:decoration-gray-700 dark:hover:text-gray-100"
              title={transaction.project.title}
            >
              {truncatePreview(transaction.project.title, PROJECT_TITLE_PREVIEW_MAX)}
            </Link>
          </span>
        ) : null}
      </div>
    </div>
  );
}
