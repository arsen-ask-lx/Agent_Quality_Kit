#!/usr/bin/env bash
# Пара «коммит агента внёс → коммит починил». Замер, а не рассуждение.
LIMIT="${1:-30}"
gh search commits 'Co-Authored-By: Claude' --limit "$LIMIT" \
  --json repository,sha,commit \
  --jq '.[] | "\(.repository.fullName)\t\(.sha)\t\(.commit.committer.date[:10])\t\(.commit.message | split("\n")[0] | .[:60])"' > seeds.tsv
echo "коммитов агента найдено: $(wc -l < seeds.tsv)"
: > pairs.tsv
while IFS=$'\t' read -r repo sha date msg; do
  files=$(gh api "repos/$repo/commits/$sha" --jq '.files[]?.filename' 2>/dev/null | head -6)
  [ -z "$files" ] && continue
  while read -r f; do
    [ -z "$f" ] && continue
    gh api "repos/$repo/commits?path=$f&per_page=10" \
      --jq ".[] | select(.sha != \"$sha\") | \"\(.commit.committer.date[:10])\t\(.sha[:8])\t\(.commit.message | split(\"\n\")[0] | .[:70])\"" 2>/dev/null \
      | awk -v seed="$date" -v repo="$repo" -v file="$f" -F'\t' '
          $1 >= seed && tolower($3) ~ /^(fix|revert|hotfix|bug)/ { print repo "\t" file "\t" seed "\t" $1 "\t" $3 }' >> pairs.tsv
  done <<< "$files"
done < seeds.tsv
echo "пар «внёс → починил» найдено: $(wc -l < pairs.tsv)"
sort -u pairs.tsv | head -20
