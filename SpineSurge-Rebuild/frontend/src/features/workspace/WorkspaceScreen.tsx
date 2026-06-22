import { useState } from 'react';
import { Assessment } from './tabs/Assessment';
import { Planning } from './tabs/Planning';
import { Compare } from './tabs/Compare';
import { Report } from './tabs/Report';

type Tab = 'assessment' | 'planning' | 'compare' | 'report';

export function WorkspaceScreen() {
  const [tab] = useState<Tab>('assessment');

  return (
    <div className="ws">

      {tab === 'assessment' && <Assessment />}
      {tab === 'planning' && <Planning />}
      {tab === 'compare' && <Compare />}
      {tab === 'report' && <Report />}
    </div>
  );
}
