-- destructive-migration: nothing has read or written entry_moves since #1522 went live in v2.141.0, and 0043 emptied it.
DROP TABLE entry_moves;
