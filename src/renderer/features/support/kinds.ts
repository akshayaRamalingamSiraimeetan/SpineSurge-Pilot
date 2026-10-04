import { Bug, HelpCircle, Lightbulb, LifeBuoy, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { SupportKind } from './supportStore';

/** Topics of a help & feedback message (HELP-01) — also the feedback categories in the Monitor. */
export const KINDS: { key: SupportKind; label: string; icon: typeof HelpCircle; hint: string }[] = [
    { key: 'question', label: 'Question', icon: HelpCircle, hint: 'Ask anything about SpineSurge…' },
    { key: 'stuck', label: "I'm stuck", icon: LifeBuoy, hint: 'What were you trying to do, and where did you get stuck?' },
    { key: 'bug', label: 'Something broke', icon: Bug, hint: 'What happened, and what did you expect?' },
    { key: 'like', label: 'I like', icon: ThumbsUp, hint: 'What works well for you?' },
    { key: 'dislike', label: "I don't like", icon: ThumbsDown, hint: "What's annoying or could be better?" },
    { key: 'idea', label: 'Idea', icon: Lightbulb, hint: 'What would you like SpineSurge to do?' },
];
export const kindLabel = (k: string | null | undefined) => KINDS.find((x) => x.key === k)?.label ?? 'Question';
