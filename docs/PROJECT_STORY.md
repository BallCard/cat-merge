# Project Story

ZJU Cat Merge is a mobile-first browser merging game built with Phaser, Vite, and TypeScript. It developed from the familiar merge-game loop into a Zhejiang University-themed experience with eighteen cat levels, tools, combo scoring, danger-line logic, a player guide, leaderboard flows, background music, and generated share cards.

The final development phase focused on mobile layout, readable cat sizing, stable physics, result-layer polish, and share-card rendering. The repository also preserves its implementation plans and handoff notes so the decisions behind the finished prototype remain understandable.

## Archive decision

The product concept and playable implementation are complete. On 2026-08-24 the remaining verification failures were resolved without changing gameplay policy: native jsdom media calls are distinguished from mocked audio, storage access tolerates incomplete browser mocks, share-card fixtures match the GIF-first preview policy, and source BOM artifacts were removed.

The project is archived because there is no current development objective. Its source, tests, assets, and design records remain available for demonstration or a future maintenance restart.
