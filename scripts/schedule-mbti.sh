#!/usr/bin/env bash
# Schedule the shortmbtistories scenes in content-engine (project "lea"), one scene per day,
# TikTok + Instagram, starting from START date. Media = fal video URL from <scene>/<video>.json.
#
#   scripts/schedule-mbti.sh 2026-08-27
set -euo pipefail
START="${1:?usage: schedule-mbti.sh YYYY-MM-DD}"
CE="node $HOME/projects/content-engine/cli/ce.mjs"
CONTENT="$HOME/projects/lea/content"

# scene | video json | caption | hashtags
SCENES=(
  "car-lost|video-energy-720p.json|ENTP and ISFJ lost in the car|#mbti #entp #isfj #16personalities"
  "job-interview|video.json|ESTJ interviewing an INFP|#mbti #estj #infp #16personalities"
  "grocery-shopping|video.json|ISTJ and ENFP go grocery shopping|#mbti #istj #enfp #16personalities"
  "house-party|video.json|ESFJ and INTP at a house party|#mbti #esfj #intp #16personalities"
  "therapy-session|video.json|ENFJ giving an ISTP therapy|#mbti #enfj #istp #16personalities"
  "gym|video.json|ESTP dragging an INFJ to the gym|#mbti #estp #infj #16personalities"
)

i=0
for entry in "${SCENES[@]}"; do
  IFS='|' read -r scene json caption tags <<<"$entry"
  date=$(date -j -v+${i}d -f "%Y-%m-%d" "$START" "+%Y-%m-%d")
  url=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['url'])" "$CONTENT/$scene/$json")
  n=$(printf "%02d" $((i + 1)))
  for platform in tiktok instagram; do
    $CE posts create --project lea --account shortmbtistories --platform "$platform" --type video \
      --date "$date" --title "$n $scene" --desc "$caption" --hashtags "$tags" --media "$url"
  done
  i=$((i + 1))
done
