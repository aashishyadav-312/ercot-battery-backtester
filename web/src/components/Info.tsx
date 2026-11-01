import { ActionIcon, Stack, Text, Tooltip } from '@mantine/core';
import { GLOSSARY } from '../data/site';

/**
 * Info icon with a glossary tooltip. Pass one or more glossary keys; the tooltip lists each term with its
 * plain-language definition. Opens on hover, keyboard focus and touch.
 */
export function Info({ terms, size = 16 }: { terms: string | string[]; size?: number }) {
  const ids = (Array.isArray(terms) ? terms : [terms]).filter((t) => {
    if (!GLOSSARY[t] && import.meta.env.DEV) console.warn(`Unknown glossary term: ${t}`);
    return !!GLOSSARY[t];
  });
  if (!ids.length) return null;
  const names = ids.map((t) => GLOSSARY[t].term).join(', ');
  return (
    <Tooltip
      multiline w={290} withArrow position="top" events={{ hover: true, focus: true, touch: true }}
      label={
        <Stack gap={6}>
          {ids.map((t) => (
            <Text key={t} size="xs" lh={1.45}><b>{GLOSSARY[t].term}.</b> {GLOSSARY[t].definition}</Text>
          ))}
        </Stack>
      }
    >
      <ActionIcon
        variant="transparent" color="gray" size={size + 4} radius="xl" aria-label={`What does this mean: ${names}`}
        style={{ flexShrink: 0, verticalAlign: 'middle' }}
      >
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r=".85" fill="currentColor" />
        </svg>
      </ActionIcon>
    </Tooltip>
  );
}
