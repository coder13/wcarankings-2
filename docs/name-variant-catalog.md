# Name variant catalog (seed)

This document is the reviewable seed for name-based rankings and lists. It is
not yet application logic. The human-maintained source of truth is
[`data/name-variants.yaml`](../data/name-variants.yaml); this document records
the snapshot used to construct it and its resulting rankings.

## Snapshot and method

- Source: the local `wcarankings-2-db-1` MariaDB `persons` table.
- Snapshot: 2026-08-01.
- Population: one primary record per competitor (`sub_id = 1`).
- Name extraction: the first whitespace-separated token in `persons.name`.
- Candidate discovery: the 500 most common extracted tokens for people marked
  `m`, and separately the 500 most common tokens for people marked `f`.
  The second leaderboard below then applies those reviewed variants to people
  marked `f` or `o`, as requested.
- Counts below are after applying the proposed variants in this document.
  Names not listed in a variant group remain their own group.
- The database collation already treats case and most diacritic-only spelling
  differences as equal. The variants column records meaningful alternate
  spellings, transliterations, and familiar short forms found in the samples.

This is deliberately a curated mapping, not fuzzy matching. A matching engine
must not infer additional equivalences from spelling similarity.

## Proposed male groups (top 50)

| Rank | Canonical name | People | Observed variants included |
| ---: | --- | ---: | --- |
| 1 | Lucas | 2,825 | Lucas, Luke, Luca, Lukas, Luka, Łukasz |
| 2 | Alexander | 2,455 | Alexander, Alex, Alexandre, Aleksander, Aleksandr, Xander |
| 3 | Daniel | 2,440 | Daniel, Dan, Danny |
| 4 | Andrew | 2,227 | Andrew, Andre, Andres, Andreas, Andrei, Andrey, Andrii |
| 5 | David | 1,924 | David, Davi, Dawid |
| 6 | Muhammad | 1,887 | Muhammad, Mohammad, Mohamed, Mohammed, Muhammed |
| 7 | Jacob | 1,858 | Jacob, Jake, Jakub, Jakob |
| 8 | Samuel | 1,827 | Samuel, Sam |
| 9 | Max | 1,793 | Max, Maxim, Maxwell, Maxime, Maximilian, Maximiliano, Maksim, Maksym, Maksymilian |
| 10 | Thomas | 1,688 | Thomas, Tom, Tomás, Tomasz, Tommy |
| 11 | Benjamin | 1,594 | Benjamin, Ben |
| 12 | Juan | 1,570 | — |
| 13 | Michael | 1,554 | Michael, Mike, Michał, Mikhail |
| 14 | Nicolas | 1,546 | Nicolas, Nicholas, Nick, Nico |
| 15 | Ethan | 1,319 | — |
| 16 | William | 1,236 | William, Will |
| 17 | Gabriel | 1,211 | — |
| 18 | Leo | 1,202 | Leo, Leon, Leonardo |
| 19 | Nathan | 1,198 | Nathan, Nathaniel, Nate |
| 20 | Joshua | 1,176 | Joshua, Josh |
| 21 | Luis | 1,155 | Luis, Luiz, Louis |
| 22 | James | 1,142 | James, Jamie, Jaime |
| 23 | Matthew | 1,100 | Matthew, Matt |
| 24 | Ryan | 1,049 | — |
| 25 | José | 1,047 | — |
| 26 | Noah | 966 | — |
| 27 | Adam | 953 | — |
| 28 | Sebastián | 931 | — |
| 29 | Jack | 926 | — |
| 30 | Joseph | 857 | Joseph, Joe, Joey |
| 31 | Nguyễn* | 854 | — |
| 32 | John | 829 | — |
| 33 | Eric | 813 | Eric, Erik, Erick |
| 34 | Christian | 802 | Christian, Cristian |
| 35 | Liam | 775 | — |
| 36 | Mark | 749 | Mark, Marc, Markus, Marko |
| 37 | Oliver | 746 | — |
| 38 | Victor | 746 | Victor, Viktor, Vitor |
| 39 | Kevin | 730 | — |
| 40 | Isaac | 716 | — |
| 41 | Diego | 711 | — |
| 42 | Aiden | 700 | Aiden, Aidan |
| 43 | George | 697 | George, Jorge |
| 44 | Christopher | 688 | Christopher, Chris |
| 45 | Ivan | 677 | — |
| 46 | Jonathan | 671 | — |
| 47 | Carlos | 652 | — |
| 48 | Charles | 648 | Charles, Charlie |
| 49 | Rafael | 642 | Rafael, Raphael |
| 50 | Stephen | 638 | Stephen, Steven, Stefan, Stepan |

\* `Nguyễn` is included because it is among the extracted display-name tokens,
but it is commonly a Vietnamese family name. It should be reviewed before any
feature presents this catalog as literal first-name data.

## Proposed female and other groups (top 25)

`Anonymous` (168 records) is excluded: it is a placeholder, not a name.

| Rank | Canonical name | People | Observed variants included |
| ---: | --- | ---: | --- |
| 1 | Ana | 455 | Ana, Anna, Anne |
| 2 | Maria | 444 | Maria, Marie, Mary |
| 3 | Sofia | 309 | Sofia, Sophia, Sophie, Sofya |
| 4 | Sara | 229 | Sara, Sarah |
| 5 | Isabella | 187 | Isabella, Isabel, Isabelle, Isabela |
| 6 | Julia | 187 | Julia, Giulia, Julie, Juliette |
| 7 | Emma | 147 | Emma, Ema |
| 8 | Laura | 140 | — |
| 9 | Hannah | 133 | Hannah, Hanna, Hana |
| 10 | Emily | 132 | Emily, Emilie |
| 11 | Lucia | 116 | Lucia, Lucie, Luciana, Lucy |
| 12 | Alexandra | 114 | Alexandra, Aleksandra, Alexa, Alexia |
| 13 | Katie | 101 | Katie, Kate, Kaitlyn, Caitlin |
| 14 | Jessica | 97 | — |
| 15 | Elizabeth | 94 | Elizabeth, Elisabeth, Elizaveta |
| 16 | Natalia | 93 | Natalia, Natalie |
| 17 | Victoria | 92 | Victoria, Viktoria, Vitoria |
| 18 | Chloe | 91 | — |
| 19 | Olivia | 90 | — |
| 20 | Anastasia | 89 | Anastasia, Anastasiia, Anastasiya |
| 21 | Clara | 87 | Clara, Klara |
| 22 | Alice | 81 | — |
| 23 | Gabriela | 78 | Gabriela, Gabriella, Gabrielle |
| 24 | Angela | 75 | Angela, Angelica, Angelina |
| 25 | Rebecca | 72 | Rebecca, Rebeca, Rebekah |

## Review rules before implementation

1. Keep every mapping explicit and one-way: a variant must belong to exactly
   one canonical name.
2. Do not automatically merge names merely because they have a shared origin
   or look similar. For example, a compound name and a short name may be
   related without being interchangeable for a person-search feature.
3. Treat culturally specific name order carefully. The current extraction uses
   the WCA display-name order, not a locale-aware given-name parser.
4. Recompute the rankings from the approved map each time the map changes;
   do not preserve the snapshot counts as source data.
