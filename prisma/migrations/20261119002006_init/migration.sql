-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TEAM_LEADER', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketKind" AS ENUM ('DIGITAL', 'PHYSICAL', 'COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "TicketInventoryStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'SOLD', 'VOID', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentCollectionStatus" AS ENUM ('NOT_COLLECTED', 'CASH_REPORTED_COLLECTED', 'CASH_RECONCILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TicketAdmissionStatus" AS ENUM ('NOT_ELIGIBLE', 'VALID', 'CHECKED_IN', 'REVOKED');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('SALE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('SUBMITTED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('BALANCED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'EXPLANATION_REQUIRED', 'EXPLAINED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReservationExpiryPolicy" AS ENUM ('HOURS_AFTER_CREATION', 'AT_RESERVATION_CLOSE', 'AT_EVENT_START');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'EXPIRED', 'CANCELLED', 'CONVERTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_points" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_point_members" (
    "user_id" UUID NOT NULL,
    "sales_point_id" UUID NOT NULL,

    CONSTRAINT "sales_point_members_pkey" PRIMARY KEY ("user_id","sales_point_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venue_capacity" INTEGER NOT NULL,
    "paid_ticket_capacity" INTEGER NOT NULL,
    "complimentary_allocation" INTEGER NOT NULL DEFAULT 0,
    "max_tickets_per_identity" INTEGER NOT NULL DEFAULT 4,
    "paid_sold_count" INTEGER NOT NULL DEFAULT 0,
    "comp_issued_count" INTEGER NOT NULL DEFAULT 0,
    "checked_in_count" INTEGER NOT NULL DEFAULT 0,
    "reservation_admit_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sellers" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "event_sellers_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_millimes" INTEGER NOT NULL,
    "capacity" INTEGER,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identity_records" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cin_ciphertext" BYTEA,
    "cin_iv" BYTEA,
    "cin_tag" BYTEA,
    "cin_key_version" INTEGER NOT NULL,
    "cin_hmac" TEXT,
    "cin_last3" TEXT,
    "retention_until" TIMESTAMP(3) NOT NULL,
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_identity_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_access_logs" (
    "id" UUID NOT NULL,
    "identity_id" UUID,
    "accessed_by_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "kind" "TicketKind" NOT NULL,
    "serial" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "inventory_status" "TicketInventoryStatus" NOT NULL,
    "payment_status" "PaymentCollectionStatus" NOT NULL DEFAULT 'NOT_COLLECTED',
    "admission_status" "TicketAdmissionStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
    "price_millimes" INTEGER,
    "holder_identity_id" UUID,
    "purchaser_identity_id" UUID,
    "batch_id" UUID,
    "assigned_seller_id" UUID,
    "assigned_sales_point_id" UUID,
    "sold_by_id" UUID,
    "sold_at" TIMESTAMP(3),
    "sales_point_id" UUID,
    "issued_by_id" UUID,
    "complimentary_reason" TEXT,
    "checked_in_at" TIMESTAMP(3),
    "checked_in_by_id" UUID,
    "reservation_attendee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_ticket_batches" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" TIMESTAMP(3),
    "printed_by_id" UUID,
    "print_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "physical_ticket_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_ticket_assignments" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "seller_id" UUID,
    "sales_point_id" UUID,
    "assigned_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transfers" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_seller_id" UUID,
    "from_sales_point_id" UUID,
    "to_seller_id" UUID,
    "to_sales_point_id" UUID,
    "authorized_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_inventory_movements" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "from_inventory" "TicketInventoryStatus",
    "to_inventory" "TicketInventoryStatus",
    "from_payment" "PaymentCollectionStatus",
    "to_payment" "PaymentCollectionStatus",
    "from_admission" "TicketAdmissionStatus",
    "to_admission" "TicketAdmissionStatus",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" UUID NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "event_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "sales_point_id" UUID,
    "customer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "authorized_by_id" UUID,
    "reverses_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_cash_accounts" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "expected_millimes" INTEGER NOT NULL DEFAULT 0,
    "reconciled_millimes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_handovers" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "declared_millimes" INTEGER NOT NULL,
    "note" TEXT,
    "status" "HandoverStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_reconciliations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "handover_id" UUID,
    "reconciled_by_id" UUID NOT NULL,
    "counted_millimes" INTEGER NOT NULL,
    "declared_millimes" INTEGER,
    "expected_before_millimes" INTEGER NOT NULL,
    "outstanding_before_millimes" INTEGER NOT NULL,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_discrepancies" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "explanation" TEXT,
    "explained_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_inventory" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_reserved_attendees" INTEGER NOT NULL,
    "max_tickets_per_reservation" INTEGER NOT NULL,
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "expiry_policy" "ReservationExpiryPolicy" NOT NULL,
    "expiry_hours" INTEGER,
    "allow_reservation_admission" BOOLEAN NOT NULL DEFAULT false,
    "pending_attendees" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reservation_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "purchaser_id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "handled_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_attendees" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "admitted_at" TIMESTAMP(3),
    "admitted_by_id" UUID,

    CONSTRAINT "reservation_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "ticket_id" UUID,
    "scanner_id" UUID NOT NULL,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sales_points_name_key" ON "sales_points"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_categories_event_id_name_key" ON "ticket_categories"("event_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identity_records_cin_hmac_key" ON "customer_identity_records"("cin_hmac");

-- CreateIndex
CREATE INDEX "identity_access_logs_identity_id_idx" ON "identity_access_logs"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_serial_key" ON "tickets"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_qr_token_key" ON "tickets"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_reservation_attendee_id_key" ON "tickets"("reservation_attendee_id");

-- CreateIndex
CREATE INDEX "tickets_event_id_inventory_status_idx" ON "tickets"("event_id", "inventory_status");

-- CreateIndex
CREATE INDEX "tickets_event_id_holder_identity_id_idx" ON "tickets"("event_id", "holder_identity_id");

-- CreateIndex
CREATE INDEX "tickets_assigned_seller_id_idx" ON "tickets"("assigned_seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "physical_ticket_batches_event_id_number_key" ON "physical_ticket_batches"("event_id", "number");

-- CreateIndex
CREATE INDEX "physical_ticket_assignments_ticket_id_idx" ON "physical_ticket_assignments"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_transfers_ticket_id_idx" ON "ticket_transfers"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_inventory_movements_ticket_id_idx" ON "ticket_inventory_movements"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_reverses_id_key" ON "cash_transactions"("reverses_id");

-- CreateIndex
CREATE INDEX "cash_transactions_seller_id_event_id_idx" ON "cash_transactions"("seller_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_cash_accounts_seller_id_event_id_key" ON "seller_cash_accounts"("seller_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_reconciliations_handover_id_key" ON "cash_reconciliations"("handover_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_inventory_event_id_key" ON "reservation_inventory"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");

-- CreateIndex
CREATE INDEX "reservations_event_id_status_idx" ON "reservations"("event_id", "status");

-- CreateIndex
CREATE INDEX "reservation_attendees_event_id_identity_id_idx" ON "reservation_attendees"("event_id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_attendees_reservation_id_identity_id_key" ON "reservation_attendees"("reservation_id", "identity_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "scan_logs_event_id_result_idx" ON "scan_logs"("event_id", "result");

-- AddForeignKey
ALTER TABLE "sales_point_members" ADD CONSTRAINT "sales_point_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_point_members" ADD CONSTRAINT "sales_point_members_sales_point_id_fkey" FOREIGN KEY ("sales_point_id") REFERENCES "sales_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sellers" ADD CONSTRAINT "event_sellers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sellers" ADD CONSTRAINT "event_sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_access_logs" ADD CONSTRAINT "identity_access_logs_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "customer_identity_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_access_logs" ADD CONSTRAINT "identity_access_logs_accessed_by_id_fkey" FOREIGN KEY ("accessed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ticket_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_holder_identity_id_fkey" FOREIGN KEY ("holder_identity_id") REFERENCES "customer_identity_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_purchaser_identity_id_fkey" FOREIGN KEY ("purchaser_identity_id") REFERENCES "customer_identity_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "physical_ticket_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_sales_point_id_fkey" FOREIGN KEY ("assigned_sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sold_by_id_fkey" FOREIGN KEY ("sold_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sales_point_id_fkey" FOREIGN KEY ("sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_id_fkey" FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reservation_attendee_id_fkey" FOREIGN KEY ("reservation_attendee_id") REFERENCES "reservation_attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_batches" ADD CONSTRAINT "physical_ticket_batches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_batches" ADD CONSTRAINT "physical_ticket_batches_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ticket_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_batches" ADD CONSTRAINT "physical_ticket_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_batches" ADD CONSTRAINT "physical_ticket_batches_printed_by_id_fkey" FOREIGN KEY ("printed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_assignments" ADD CONSTRAINT "physical_ticket_assignments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_assignments" ADD CONSTRAINT "physical_ticket_assignments_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_assignments" ADD CONSTRAINT "physical_ticket_assignments_sales_point_id_fkey" FOREIGN KEY ("sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_ticket_assignments" ADD CONSTRAINT "physical_ticket_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_from_seller_id_fkey" FOREIGN KEY ("from_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_from_sales_point_id_fkey" FOREIGN KEY ("from_sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_to_seller_id_fkey" FOREIGN KEY ("to_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_to_sales_point_id_fkey" FOREIGN KEY ("to_sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_inventory_movements" ADD CONSTRAINT "ticket_inventory_movements_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_inventory_movements" ADD CONSTRAINT "ticket_inventory_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_sales_point_id_fkey" FOREIGN KEY ("sales_point_id") REFERENCES "sales_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_identity_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "seller_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "cash_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_cash_accounts" ADD CONSTRAINT "seller_cash_accounts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_cash_accounts" ADD CONSTRAINT "seller_cash_accounts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "seller_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "seller_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "cash_handovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_reconciled_by_id_fkey" FOREIGN KEY ("reconciled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_discrepancies" ADD CONSTRAINT "cash_discrepancies_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "seller_cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_discrepancies" ADD CONSTRAINT "cash_discrepancies_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "cash_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_discrepancies" ADD CONSTRAINT "cash_discrepancies_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_inventory" ADD CONSTRAINT "reservation_inventory_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ticket_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_purchaser_id_fkey" FOREIGN KEY ("purchaser_id") REFERENCES "customer_identity_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_attendees" ADD CONSTRAINT "reservation_attendees_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_attendees" ADD CONSTRAINT "reservation_attendees_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "customer_identity_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_attendees" ADD CONSTRAINT "reservation_attendees_admitted_by_id_fkey" FOREIGN KEY ("admitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_scanner_id_fkey" FOREIGN KEY ("scanner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
