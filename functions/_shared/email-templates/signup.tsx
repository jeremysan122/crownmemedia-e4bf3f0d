/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Claim your throne — confirm your CrownMe email 👑</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandText}>👑 CrownMe</Text>
          <Text style={styles.brandTag}>Where Legends Reign</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Claim your throne, royal.</Heading>
          <Text style={styles.text}>
            Welcome to{' '}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Your crown awaits — but first, let's confirm{' '}
            <Link href={`mailto:${recipient}`} style={styles.link}>
              {recipient}
            </Link>
            .
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Verify & Enter the Court
          </Button>
          <Text style={styles.signature}>— The CrownMe Court</Text>
          <Text style={styles.footer}>
            If you didn't create a CrownMe account, you can safely ignore this
            email. No crown will be issued in your name.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
