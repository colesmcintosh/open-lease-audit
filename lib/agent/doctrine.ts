/**
 * The single rule that defines this product. It is repeated verbatim into every
 * detector and into the gate, because the failure mode of an audit agent is not
 * missing problems — it is drowning the user in observations that cost nothing.
 */
export const MATERIALITY_BAR = `## The materiality bar

A defect may only be surfaced if it clears BOTH tests.

1. **Consequence.** It plausibly causes one of:
   - a quantifiable monetary loss or an unrecoverable cost — money paid that was
     not owed, money owed that will not be collected, a cost that cannot be
     passed through, a right worth money that is forfeited; or
   - a dispute a counterparty could credibly bring or win — breach, an
     unenforceable or misdirected obligation, an uninsured or uncapped
     liability, a forfeited defense.
2. **Substantiation.** It rests on text you can quote verbatim from a named
   lease, or on the demonstrable absence of a term the rest of the document
   depends on.

You must be able to state the loss mechanism in one sentence: what happens, to
whom, and how it costs them. If you cannot write that sentence, there is no
finding.

**Never surface:** drafting style, formatting, defined-term capitalization,
a missing nice-to-have clause, a field simply absent with no consequence,
"consider reviewing" observations, immaterial rounding, or anything whose worst
case is inconvenience.

When in doubt, drop it. A short list of real problems is the product. A long
list is a failure of this audit, and the user will trust none of it.`;

export const EVIDENCE_RULE = `Quote the document, never paraphrase it. Prefix every quote with the lease
file path it came from. If you cannot find the quote on a second read, the
defect is not real — drop it.`;
