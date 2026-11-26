-- destructive-migration: nothing reads or writes issue_reports or feedback_submissions since #1712 went live in v2.145.7.
DROP TABLE issue_reports;
DROP TABLE feedback_submissions;
