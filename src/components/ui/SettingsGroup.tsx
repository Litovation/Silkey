import React from "react";
import type { LucideIcon } from "lucide-react";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  /** With an icon the header becomes a titled section instead of a small label. */
  icon?: LucideIcon;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  icon: Icon,
  children,
}) => {
  return (
    <div className="space-y-2">
      {title && Icon && (
        <div className="flex items-center gap-3 px-1">
          <span className="shrink-0 rounded-lg bg-logo-primary/15 p-2 text-logo-primary">
            <Icon width={16} height={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">{title}</h2>
            {description && (
              <p className="text-xs text-mid-gray">{description}</p>
            )}
          </div>
        </div>
      )}
      {title && !Icon && (
        <div className="px-4">
          <h2 className="text-xs font-medium text-mid-gray uppercase tracking-wide">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-mid-gray mt-1">{description}</p>
          )}
        </div>
      )}
      <div className="bg-background border border-mid-gray/20 rounded-lg overflow-visible">
        <div className="divide-y divide-mid-gray/20">{children}</div>
      </div>
    </div>
  );
};
