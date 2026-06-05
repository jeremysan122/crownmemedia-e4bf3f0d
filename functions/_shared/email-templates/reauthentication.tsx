/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CrownMe verification code 👑</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>👑 CrownMe</Text>
          <Text style={styles.brandTag}>Where Legends Reign</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirm it's you.</Heading>
          <Text style={styles.text}>
            Use the royal seal below to confirm your identity and continue your
            reign.
          </Text>
          <Text style={styles.code}>{token}</Text>
          <Text style={styles.signature}>— The CrownMe Court</Text>
          <Text style={styles.footer}>
            This code expires shortly. If you didn't request it, ignore this
            scroll — your throne stays sealed.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
