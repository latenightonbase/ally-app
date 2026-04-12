/**
 * Stripe billing routes
 * Handles payment intent / subscription setup for the mobile paywall.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        – your Stripe secret key
 *   STRIPE_WEBHOOK_SECRET    – for verifying webhook events
 */
import { Elysia, t } from "elysia";
import Stripe from "stripe";
import { auth } from "../lib/auth";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

export const billingRoutes = new Elysia({ prefix: "/api/billing" })
  /**
   * POST /api/billing/setup-intent
   * Creates (or reuses) a Stripe Customer and returns everything the
   * Stripe Payment Sheet needs to initialise on the client.
   */
  .post(
    "/setup-intent",
    async ({ request, body, set }) => {
      const stripe = getStripe();

      // Identify the caller — optional auth (guest users may not have an account yet)
      let customerEmail: string | undefined;
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        customerEmail = session?.user?.email ?? undefined;
      } catch {
        // Guest — no session cookie yet
      }

      const { priceId } = body as { priceId: string };

      try {
        // Find or create a Stripe customer
        let customerId: string;
        if (customerEmail) {
          const existing = await stripe.customers.list({
            email: customerEmail,
            limit: 1,
          });
          if (existing.data.length > 0) {
            customerId = existing.data[0].id;
          } else {
            const customer = await stripe.customers.create({
              email: customerEmail,
            });
            customerId = customer.id;
          }
        } else {
          const customer = await stripe.customers.create({});
          customerId = customer.id;
        }

        // Create an ephemeral key for the customer (required by PaymentSheet)
        const ephemeralKey = await stripe.ephemeralKeys.create(
          { customer: customerId },
          { apiVersion: "2026-03-25.dahlia" },
        );

        // Create a SetupIntent so we can save the payment method and then
        // create the actual subscription server-side after the trial ends.
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: "off_session",
          metadata: { priceId },
        });

        return {
          paymentIntent: setupIntent.client_secret,
          ephemeralKey: ephemeralKey.secret,
          customer: customerId,
          publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
        };
      } catch (e) {
        set.status = 500;
        const message = e instanceof Error ? e.message : "Stripe error";
        return { error: { message, status: 500 } };
      }
    },
    {
      body: t.Object({
        priceId: t.String(),
        planId: t.Optional(t.String()),
      }),
    },
  )

  /**
   * POST /api/billing/webhook
   * Receives Stripe webhook events (payment success, subscription updates, etc.)
   */
  .post("/webhook", async ({ request, set }) => {
    const stripe = getStripe();
    const sig = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      set.status = 400;
      return { error: "Missing signature" };
    }

    const rawBody = await request.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (e) {
      set.status = 400;
      return { error: `Webhook Error: ${e instanceof Error ? e.message : "Invalid signature"}` };
    }

    switch (event.type) {
      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        const priceId = setupIntent.metadata?.priceId;
        const customerId = setupIntent.customer as string;

        if (priceId && customerId) {
          // Create the actual subscription starting the trial now
          await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            trial_period_days: 7,
            default_payment_method: setupIntent.payment_method as string,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Handle cancellation — you could downgrade user tier here
        console.log("[stripe] Subscription cancelled:", event.data.object);
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return { received: true };
  });
