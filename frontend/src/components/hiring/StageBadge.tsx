'use client';

import { Badge } from '@/components/ui/Badge';
import { stageMeta } from '@/lib/hiring';

export function StageBadge({ stage, dot = true }: { stage: string; dot?: boolean }) {
  const meta = stageMeta(stage);
  return (
    <Badge variant={meta.badge} dot={dot}>
      {meta.label}
    </Badge>
  );
}

export default StageBadge;
