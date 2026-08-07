# Feed candidate precomputation

The feed candidate builder uses one recent-result query and grouped ranking
queries. It does not load one ranking page for every possible filter set.

The trigger window is the seven days ending at the current date. The builder
uses recent result IDs, people, competitions, events, countries, and
continents to limit the candidate work.

Each stored candidate contains one interesting result reference. The feed
loads the source stat later and displays five rows around that result.

The current benchmark against the Bespin MariaDB pod found 4,485 recent
results, 4,816 affected descriptors, and 7,662 candidates in about 4.5
seconds. This is a benchmark hook, not a promise for every export size.

The current-year person path is grouped. A current-year result ranking needs a
separate projection adapter because recomputing all 2026 regional windows with
SQL window functions exceeds the database statement limit. The builder keeps
the all-time result path and does not run that unbounded query.

Competition and city ranking adapters are still missing from this slice.
