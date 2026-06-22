/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from '../registry.ts'
import { HERO_BASE, heroImg, styles } from '../../email-templates/_brand.ts'
import { safeOptionalString, safeParse, z } from '../_validate.ts'

const schema = z.object({ token: safeOptionalString() })

const Email = (raw: unknown) => {
  const { token } = safeParse(schema, raw)
  const code = token || '000000'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your CrownMe verification code 👑</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={{ padding: 0, margin: 0 }}>
            <Img
              src={`${HERO_BASE}/crownme-reauthentication-full-design.png`}
              alt="CrownMe — Verification code"
              width="560"
              style={heroImg}
            />
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>Confirm it's you.</Heading>
            <Text style={styles.text}>
              Use the royal seal below to confirm your identity and continue your reign.
            </Text>
            <Text style={styles.code}>{code}</Text>
            <Text style={styles.signature}>— The CrownMe Court</Text>
            <Text style={styles.footer}>
              This code expires shortly. If you didn't request it, ignore this scroll — your throne stays sealed.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  schema,
  subject: 'Your CrownMe verification code 👑',
  displayName: 'Auth · Reauthentication code (test)',
  previewData: { token: '482917' },
} satisfies TemplateEntry
