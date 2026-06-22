import { useMemo, useState } from "react";
import { crownmeExactEmailDefinitions, crownmeExactEmailTemplates, renderCrownMeExactEmail, type CrownMeExactEmailContext, type CrownMeExactEmailKey } from "@/lib/email/crownmeExactEmailTemplates";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Copy, ExternalLink, Mail, Sparkles } from "lucide-react";

const defaultContext: CrownMeExactEmailContext = {
  siteUrl: "https://crownmemedia.com",
  postUrl: "https://crownmemedia.com/post/example",
  battleUrl: "https://crownmemedia.com/battles/example",
  battleResultUrl: "https://crownmemedia.com/battles/example/results",
  crownUrl: "https://crownmemedia.com/leaderboard",
  leaderboardUrl: "https://crownmemedia.com/leaderboard",
  giftUrl: "https://crownmemedia.com/wallet",
  receiptUrl: "https://crownmemedia.com/wallet",
  walletUrl: "https://crownmemedia.com/wallet",
  verificationUrl: "https://crownmemedia.com/verification",
};

const EmailTemplatePreview = () => {
  const { toast } = useToast();
  const [selectedKey, setSelectedKey] = useState<CrownMeExactEmailKey>("confirmSignup");
  const [context, setContext] = useState<CrownMeExactEmailContext>(defaultContext);

  const rendered = useMemo(() => renderCrownMeExactEmail(selectedKey, context), [selectedKey, context]);
  const definition = crownmeExactEmailTemplates[selectedKey];

  const updateContext = (field: keyof CrownMeExactEmailContext, value: string) => {
    setContext((prev) => ({ ...prev, [field]: value }));
  };

  const copyText = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied`, description: "Ready to paste." });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 md:px-6 lg:flex-row lg:items-start">
        <section className="w-full lg:sticky lg:top-6 lg:max-w-[460px]">
          <Card className="border-primary/20 bg-card/90 p-4 shadow-[var(--shadow-card)] backdrop-blur">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Internal</p>
                <h1 className="font-display text-2xl text-gold">CrownMe Email Template Preview</h1>
              </div>
              <Badge variant="secondary" className="border border-primary/30 bg-secondary/40 text-secondary-foreground">20 templates</Badge>
            </div>

            <div className="mb-4 grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span>Exact full-design PNG art at 640px</span></div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><span>Auth subjects preserve template variables exactly</span></div>
            </div>

            <Tabs value={selectedKey} onValueChange={(value) => setSelectedKey(value as CrownMeExactEmailKey)} className="w-full">
              <ScrollArea className="h-[360px] pr-3">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0">
                  {crownmeExactEmailDefinitions.map((template) => (
                    <TabsTrigger
                      key={template.key}
                      value={template.key}
                      className="h-auto justify-between rounded-lg border border-border/70 bg-card/70 px-3 py-3 text-left data-[state=active]:border-primary/60 data-[state=active]:bg-secondary/30"
                    >
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="truncate font-medium text-foreground">{template.label}</span>
                        <span className="text-[11px] text-muted-foreground">{template.category}</span>
                      </span>
                      {template.supabase ? (
                        <Badge variant="outline" className="ml-2 shrink-0 border-primary/40 text-primary">Auth</Badge>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollArea>

              {crownmeExactEmailDefinitions.map((template) => (
                <TabsContent key={template.key} value={template.key} className="mt-4 space-y-4">
                  <Card className="border-border/70 bg-background/50 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/15">{template.label}</Badge>
                      <Badge variant="outline" className="border-border/60 text-muted-foreground">{template.fullDesignImage}</Badge>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Subject</Label>
                        <Textarea readOnly value={rendered.subject} className="mt-2 min-h-[72px] bg-card/70" />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button onClick={() => void copyText("Subject", rendered.subject)} className="gap-2">
                          <Copy className="h-4 w-4" /> Copy Subject
                        </Button>
                        <Button variant="secondary" onClick={() => void copyText("HTML", rendered.html)} className="gap-2">
                          <Copy className="h-4 w-4" /> Copy HTML
                        </Button>
                      </div>
                      {rendered.href ? (
                        <div>
                          <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Resolved CTA link</Label>
                          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-sm text-foreground">
                            <span className="min-w-0 flex-1 truncate">{rendered.href}</span>
                            <a href={rendered.href} target="_blank" rel="noreferrer" className="text-primary">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>

            <Separator className="my-4 bg-border/70" />

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="site-url">Site URL</Label>
                <Input id="site-url" value={context.siteUrl ?? ""} onChange={(e) => updateContext("siteUrl", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="post-url">Post URL</Label>
                <Input id="post-url" value={context.postUrl ?? ""} onChange={(e) => updateContext("postUrl", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="battle-url">Battle URL</Label>
                <Input id="battle-url" value={context.battleUrl ?? ""} onChange={(e) => updateContext("battleUrl", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="battle-result-url">Battle result URL</Label>
                <Input id="battle-result-url" value={context.battleResultUrl ?? ""} onChange={(e) => updateContext("battleResultUrl", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wallet-url">Wallet / receipt / gift URL</Label>
                <Input id="wallet-url" value={context.walletUrl ?? ""} onChange={(e) => updateContext("walletUrl", e.target.value)} />
              </div>
            </div>
          </Card>
        </section>

        <section className="min-w-0 flex-1">
          <Card className="overflow-hidden border-primary/20 bg-card/70 p-3 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Live HTML preview</p>
                <p className="text-sm text-foreground">{definition.label}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>Image width: 640px</div>
                <div>{definition.supabase ? "Auth template" : "Lifecycle template"}</div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-2 md:p-4">
              <iframe
                title={`${definition.label} email preview`}
                srcDoc={rendered.html}
                className="h-[1200px] w-full rounded-lg border border-border/60 bg-white"
              />
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
};

export default EmailTemplatePreview;