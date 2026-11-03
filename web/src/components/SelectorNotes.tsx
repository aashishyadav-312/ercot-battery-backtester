import { Text } from '@mantine/core';
import { useApp } from '../state';
import { DEGS } from '../data/loader';
import { degNote, yearNote } from '../data/notes';

/** Helper lines under the top-bar selectors: what a partial year means, and which degradation costs are precomputed. */
export function SelectorNotes() {
  const { sel, index } = useApp();
  const year = yearNote(index, sel.year);
  return (
    <Text size="xs" c="dimmed" mb="md" lh={1.45} data-testid="selector-notes">
      {year ? `${year} ` : ''}{degNote(DEGS)}
    </Text>
  );
}
