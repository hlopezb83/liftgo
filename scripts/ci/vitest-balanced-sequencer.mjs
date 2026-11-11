import { relative, sep } from 'node:path';
import { BaseSequencer } from 'vitest/node';
import profile from './vitest-ci-profile.json' with { type: 'json' };

// The profile sums Vitest module diagnostics (setup, imports, environment and tests)
// from GitHub Actions run 43065138191. New files use its median until reprofiled.
export default class BalancedCiSequencer extends BaseSequencer {
  async shard(specifications) {
    const { index, count } = this.ctx.config.shard;
    const ranked = specifications.map((specification) => {
      const file = relative(specification.project.config.root, specification.moduleId).split(sep).join('/');
      return {
        specification,
        key: JSON.stringify([specification.project.name, specification.pool, file]),
        milliseconds: profile.files[file] ?? profile.unknownFileMs,
      };
    });
    ranked.sort((a, b) => {
      if (a.milliseconds !== b.milliseconds) return b.milliseconds - a.milliseconds;
      if (a.key === b.key) return 0;
      return a.key < b.key ? -1 : 1;
    });

    const shards = Array.from({ length: count }, () => ({ milliseconds: 0, specifications: [] }));
    for (const entry of ranked) {
      const lightest = shards.reduce((shortest, shard) => shortest.milliseconds <= shard.milliseconds ? shortest : shard);
      lightest.specifications.push(entry.specification);
      lightest.milliseconds += entry.milliseconds;
    }
    return shards[index - 1].specifications;
  }
}
