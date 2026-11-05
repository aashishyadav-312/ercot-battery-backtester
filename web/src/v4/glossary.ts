// Glossary terms for the V4 rules (4CP and SB 6), built from custom/config/datacenter_rules.json so the text, source and date are the
// config's, not retyped here. The ancillary services and RTC+B entries for V4 views are ancillary_services_v4 and rtcb_v4 in data/glossary.json.

export interface ConfigTerm { term: string; definition: string; citation: string; source: string; asOf: string }

interface Rules {
  fourCp: {
    method: { text: string; citation: string; source: string; asOf: string };
    chargeTiming: { text: string };
    review: { status: string };
  };
  sb6: {
    statute: { citation: string; text: string; source: string; asOf: string };
    provisions: { id: string; text: string }[];
  };
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function v4ConfigTerms(rules: Rules): Record<string, ConfigTerm> {
  const { fourCp, sb6 } = rules;
  const threshold = sb6.provisions.find((p) => p.id === 'threshold');
  return {
    fourcp: {
      term: '4CP',
      definition: [fourCp.method.text, fourCp.chargeTiming.text, `Status: ${fourCp.review.status}.`].map(sentence).join(' '),
      citation: fourCp.method.citation, source: fourCp.method.source, asOf: fourCp.method.asOf,
    },
    sb6: {
      term: 'SB 6',
      definition: [sb6.statute.citation, sb6.statute.text, threshold?.text ?? ''].filter(Boolean).map(sentence).join(' '),
      citation: sb6.statute.citation, source: sb6.statute.source, asOf: sb6.statute.asOf,
    },
  };
}
