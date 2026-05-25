/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles } from '../email-templates/_brand.ts'

const SITE_NAME = 'CrownMe'
const SITE_URL = 'https://crownmemedia.com'

interface WelcomeProps {
  username?: string
  first_name?: string
}

const WelcomeEmail = ({ username, first_name }: WelcomeProps) => {
  const name = first_name || username || 'Royal'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to CrownMe — your reign begins now.</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandText}>CROWNME</Text>
            <Text style={styles.brandTag}>Wear the Crown</Text>
          </Section>
          <Section style={{ padding: '32px 28px' }}>
            <Heading style={{ fontSize: '22px', color: brand.royal, margin: '0 0 16px' }}>
              Welcome, {name}.
            </Heading>
            <Text style={{ fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }}>
              Your throne is ready. You're now part of the most exclusive creator competition on the
              internet — where votes crown kings and queens daily.
            </Text>
            <Text style={{ fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 24px' }}>
              Post your first photo, claim a category, and start collecting crowns.
            </Text>
            <Button
              href={`${SITE_URL}/upload`}
              style={{
                backgroundColor: brand.gold,
                color: brand.royal,
                padding: '14px 28px',
                borderRadius: '10px',
                fontWeight: 'bold',
                textDecoration: 'none',
                fontSize: '15px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              Claim Your Crown
            </Button>
            <Text style={{ fontSize: '13px', color: '#777', margin: '28px 0 0', lineHeight: '1.5' }}>
              Tip: Complete your profile with an avatar and bio to win more votes.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to CrownMe — your reign begins now',
  displayName: 'Welcome email',
  previewData: { username: 'royal_one', first_name: 'Alex' },
} satisfies TemplateEntry
