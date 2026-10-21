import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runAipojuHostAuthProbe } from '../src/aipoju-host-auth-probe.ts'

const roots: string[] = []

async function fixture(): Promise<{ home: string; diagnostics: string; helper: string; cli: string }> {
  const home = await mkdtemp(join(tmpdir(), 'dsh-aipoju-probe-'))
  roots.push(home)
  await chmod(home, 0o700)
  const diagnostics = join(home, 'diagnostics')
  await mkdir(diagnostics, { mode: 0o700 })
  const helper = join(home, 'KeychainCredentialHelper')
  await writeFile(helper, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const cli = join(home, 'breakout')
  return { home, diagnostics, helper, cli }
}

async function createCli(path: string, body: string): Promise<void> {
  await writeFile(path, `#!/usr/bin/env node\n${body}\n`, { mode: 0o700 })
  await chmod(path, 0o700)
}

async function mark(diagnostics: string, mode = 0o600): Promise<void> {
  const marker = join(diagnostics, 'aipoju-host-auth-probe.once')
  await writeFile(marker, '', { mode })
  await chmod(marker, mode)
}

interface ProbeOverrides {
  readonly cliPath?: string
  readonly pathValue?: string
  readonly timeoutMs?: number
  readonly outputLimitBytes?: number
}

async function probe(
  paths: Awaited<ReturnType<typeof fixture>>,
  overrides: ProbeOverrides = {},
): Promise<void> {
  await runAipojuHostAuthProbe({
    home: paths.home,
    helperPath: paths.helper,
    expectedHelperPath: paths.helper,
    cliPath: overrides.cliPath ?? paths.cli,
    pathValue: overrides.pathValue ?? process.env.PATH ?? '',
    ...(overrides.timeoutMs === undefined ? {} : { timeoutMs: overrides.timeoutMs }),
    ...(overrides.outputLimitBytes === undefined ? {} : { outputLimitBytes: overrides.outputLimitBytes }),
  })
}

async function readResult(diagnostics: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(diagnostics, 'aipoju-host-auth-probe.result.json'), 'utf8')) as Record<string, unknown>
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Aipoju Desktop Host startup probe', () => {
  it('does nothing without an explicit marker or the Desktop Shell identity', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'process.stdout.write(JSON.stringify({ capabilities: [{ name: "topic.query" }] }))')
    await probe(paths)
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'))).rejects.toMatchObject({ code: 'ENOENT' })

    await mark(paths.diagnostics)
    await runAipojuHostAuthProbe({
      home: paths.home,
      helperPath: join(paths.home, 'other-host-helper'),
      expectedHelperPath: paths.helper,
      cliPath: paths.cli,
    })
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.once'))).resolves.toBeDefined()
  })

  it('spawns the fixed read-only command and records only a valid capability count', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'process.stdout.write(JSON.stringify({ capabilities: [{ name: "topic.query" }, { name: "topic.detail" }] }))')
    await mark(paths.diagnostics)
    await probe(paths)

    await expect(readResult(paths.diagnostics)).resolves.toEqual({
      runtime: 'desktop_host',
      cliAvailable: true,
      authenticated: true,
      capabilitiesAvailable: true,
      capabilityCount: 2,
      status: 'AUTH_OK',
      errorCategory: null,
    })
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.once'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'), 'utf8')).resolves.not.toContain('topic.query')
  })

  it('records authentication failure without persisting command output', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'process.stderr.write("未登录：private diagnostic text"); process.exitCode = 1')
    await mark(paths.diagnostics)
    await probe(paths)

    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'AUTH_BLOCKED', authenticated: false, errorCategory: 'authentication_unavailable' })
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'), 'utf8')).resolves.not.toContain('private diagnostic text')
  })

  it('distinguishes a missing Node runtime from a missing CLI', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'process.stdout.write("[]")')
    await mark(paths.diagnostics)
    await probe(paths, { pathValue: dirname(paths.home) })
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'CLI_START_FAILED', errorCategory: 'node_runtime_missing_from_path' })

    await rm(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'))
    await mark(paths.diagnostics)
    await probe(paths, { cliPath: join(paths.home, 'missing-cli') })
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'CLI_START_FAILED', cliAvailable: false, errorCategory: 'cli_unavailable' })
  })

  it('distinguishes timeout and invalid capability output', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'setTimeout(() => undefined, 60_000)')
    await mark(paths.diagnostics)
    await probe(paths, { timeoutMs: 30 })
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'TIMEOUT', authenticated: null, errorCategory: 'capabilities_timeout' })

    await rm(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'))
    await createCli(paths.cli, 'process.stdout.write("private output");')
    await mark(paths.diagnostics)
    await probe(paths)
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'UNKNOWN', authenticated: null, capabilitiesAvailable: false })
    await expect(readFile(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'), 'utf8')).resolves.not.toContain('private output')
  })

  it('rejects insecure marker permissions and caps captured output', async () => {
    const paths = await fixture()
    await createCli(paths.cli, 'process.stdout.write("x".repeat(4096))')
    await mark(paths.diagnostics, 0o644)
    await probe(paths)
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'UNKNOWN', errorCategory: 'marker_invalid' })

    await rm(join(paths.diagnostics, 'aipoju-host-auth-probe.result.json'))
    await mark(paths.diagnostics)
    await probe(paths, { outputLimitBytes: 128 })
    await expect(readResult(paths.diagnostics)).resolves.toMatchObject({ status: 'UNKNOWN', errorCategory: 'output_limit_exceeded' })
  })
})
