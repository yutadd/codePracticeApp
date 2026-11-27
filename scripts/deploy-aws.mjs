// dist-static/ を S3 + CloudFront に配信する（AWS CLI と認証情報が必要）。
// 初回はスタック（aws/static-site.yaml）を作り、以降はファイルの同期とキャッシュの削除だけ行う。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './common.mjs';

const STACK = process.env.STACK_NAME ?? 'code-practice-app';
const DIST = resolve(ROOT, 'dist-static');

function aws(...args) {
  return execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

if (!existsSync(DIST)) {
  console.error('dist-static/ がありません。先に npm run build:static を実行してください。');
  process.exit(1);
}

try {
  const account = aws('sts', 'get-caller-identity', '--query', 'Account', '--output', 'text');
  console.log(`AWS アカウント ${account} に配信します。`);
} catch {
  console.error('AWS の認証に失敗しました。aws configure list と aws sts get-caller-identity で認証情報を確認してください。');
  process.exit(1);
}

console.log(`スタック ${STACK} を作成・更新しています（初回は CloudFront の作成に数分かかります）…`);
aws(
  'cloudformation', 'deploy',
  '--stack-name', STACK,
  '--template-file', resolve(ROOT, 'aws/static-site.yaml'),
  '--no-fail-on-empty-changeset',
);

const outputs = Object.fromEntries(
  JSON.parse(aws('cloudformation', 'describe-stacks', '--stack-name', STACK, '--query', 'Stacks[0].Outputs')).map(
    (o) => [o.OutputKey, o.OutputValue],
  ),
);

// ファイル名にハッシュが付く assets/ は長くキャッシュし、それ以外（index.html など）は毎回確認させる
const bucket = `s3://${outputs.BucketName}`;
aws('s3', 'sync', resolve(DIST, 'assets'), `${bucket}/assets`, '--delete',
  '--cache-control', 'public, max-age=31536000, immutable');
aws('s3', 'sync', DIST, bucket, '--delete', '--exclude', 'assets/*', '--cache-control', 'no-cache');
aws('cloudfront', 'create-invalidation', '--distribution-id', outputs.DistributionId, '--paths', '/*');

console.log(`配信しました：${outputs.Url}`);
