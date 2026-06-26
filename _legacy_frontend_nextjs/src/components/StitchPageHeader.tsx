'use client';

import type { ReactNode } from 'react';

export type StitchPageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function StitchPageHeader({ eyebrow, title, subtitle, actions }: StitchPageHeaderProps) {
  return (
    <div className="mb-4 sm:mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <p className="text-[#2065d1] font-bold tracking-widest uppercase text-[10px] sm:text-[11px] mb-1.5 font-[Inter]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-[Manrope] font-extrabold tracking-tight text-white text-3xl sm:text-4xl mb-1 sm:mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[#8c909f] text-sm sm:text-base leading-relaxed max-w-4xl font-[Inter]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
