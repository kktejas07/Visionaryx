'use client';

import { EmptyStateIllustration } from './illustrations';

interface EmptyStateProps {
  message: string;
  illustrationSize?: number;
}

export function EmptyState({ message, illustrationSize = 140 }: EmptyStateProps) {
  return (
    <div className="py-8 flex flex-col items-center text-center">
      <div className="mb-4">
        <EmptyStateIllustration size={illustrationSize} />
      </div>
      <p className="text-[#8c909f] text-sm font-medium font-[Inter]">
        {message}
      </p>
    </div>
  );
}
