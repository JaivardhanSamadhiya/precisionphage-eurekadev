console.log(`PrecisionPhage — saved evidence screening workbench

Requirements: Node.js 22 or later. No install, API keys, or research folder needed.

  npm start       Serve the website at http://127.0.0.1:4173
  npm test        Verify planner, data, portable exports, and static server
  npm run check   Verify snapshot hashes and JavaScript syntax
  npm run build   Create a clean dist/ folder for any static HTTP host

Optional research audit (Python standard library):
  python scripts/extract-data.py --source D:\\full_pipeline --check

The source research checkout is read-only. Extraction refuses output inside it.
This demo uses saved predictions. Candidate mixtures require further testing.
Original source citations, hashes, and license notices: public/data/

Local-only submission writing and setup documentation: README.md, docs/,
hackathon-submission/. These are intentionally excluded from GitHub commits.
After creating an empty GitHub repository, add its actual origin URL and run
git push -u origin main. No remote or deployment is created by these scripts.
`);
