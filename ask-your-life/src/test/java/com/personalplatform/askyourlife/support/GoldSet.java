package com.personalplatform.askyourlife.support;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Gold set for retrieval quality: everyday household paperwork. Each query is written to share as few content words
 * as possible with its passage (synonyms and paraphrase: "fridge" vs "refrigerator", "landlord" vs "lease"), which
 * is exactly where a lexical stand-in fails. One relevant passage per query; every passage is its own document.
 */
public final class GoldSet {

    public record Pair(String title, String passage, String query) {}

    public static final List<Pair> PAIRS = List.of(
            new Pair("Refrigerator purchase",
                    "Invoice 4471: Samsung refrigerator, double door, delivered and installed on 3 March. Paid by card.",
                    "how much did the new fridge cost"),
            new Pair("Car cover",
                    "Your automobile policy covers collision and theft. Annual premium 612 euros, renewal due in October.",
                    "vehicle insurance renewal date"),
            new Pair("Apartment lease",
                    "The tenancy agreement runs for twelve months. Monthly payment to the landlord is 950, due on the first.",
                    "when is my rent due"),
            new Pair("Power statement",
                    "Electricity statement for February: 412 kWh consumed, amount payable 96.40, direct debit on the 15th.",
                    "power bill for last month"),
            new Pair("Laptop guarantee",
                    "The notebook computer is guaranteed for two years from purchase against manufacturing defects.",
                    "laptop warranty length"),
            new Pair("Dentist visit",
                    "Dental surgery: two fillings and a scale and polish. Patient contribution 85, remainder claimed from the scheme.",
                    "tooth doctor appointment cost"),
            new Pair("Water statement",
                    "Water and sewerage charges for the quarter: 58 cubic metres, total 74.10.",
                    "utility invoice for the tap supply"),
            new Pair("Boiler service",
                    "Annual heating system maintenance completed. The engineer replaced the pressure valve; next inspection in 12 months.",
                    "furnace repair record"),
            new Pair("Phone contract",
                    "Mobile plan: unlimited calls and texts, 20 GB data, 24 month minimum term, early exit fee applies.",
                    "cell carrier subscription cancellation penalty"),
            new Pair("Vet clinic",
                    "Vaccination booster and worming tablets for Bella the dog. Next jab due in spring.",
                    "pet shots for my puppy"),
            new Pair("Broadband",
                    "Fibre internet service, 500 Mbps, router included. Monthly charge 35 for the first year.",
                    "wifi provider monthly price"),
            new Pair("Council tax",
                    "Municipal property levy for the year, band C, payable in ten instalments.",
                    "local government house charge"),
            new Pair("Home cover",
                    "Buildings and contents policy. Excess 250 for any claim; accidental damage cover is not included.",
                    "household insurance deductible"),
            new Pair("Washing machine",
                    "Receipt: front-loading washer, 8 kg drum, extended guarantee bought at the till for 49.",
                    "laundry appliance warranty"),
            new Pair("Gym",
                    "Fitness club membership, 12 months, direct debit of 29 each month, freeze allowed for illness.",
                    "workout centre subscription"),
            new Pair("Childcare",
                    "Nursery fees for September: five mornings a week, lunch included, invoice payable by the 5th.",
                    "daycare bill for my kid"),
            new Pair("Car repair",
                    "Garage invoice: brake pads and discs replaced, new tyres fitted, labour two hours.",
                    "mechanic receipt for vehicle maintenance"),
            new Pair("Medicine",
                    "Pharmacy receipt: antibiotics course and painkillers, prescription charge paid.",
                    "drugstore purchase of pills"),
            new Pair("Flight booking",
                    "E-ticket: return airfare to Lisbon, departing 14 July, one checked bag included.",
                    "plane tickets for the summer holiday"),
            new Pair("Hotel",
                    "Accommodation confirmation: three nights, double room, breakfast included, free cancellation until Friday.",
                    "lodging reservation for the trip"),
            new Pair("Salary",
                    "Payslip for May: gross pay 3,200, income tax and pension contributions deducted, net 2,410.",
                    "monthly wages statement"),
            new Pair("Tax return",
                    "Self assessment filed with the revenue service; refund of 312 expected within eight weeks.",
                    "income declaration to the authorities"),
            new Pair("Mortgage",
                    "Home loan statement: outstanding balance 182,000, fixed interest rate 3.1 percent until 2029.",
                    "house borrowing remaining amount"),
            new Pair("Parking fine",
                    "Penalty charge notice: vehicle left in a restricted bay, 60 if paid within 14 days.",
                    "ticket for leaving the car in the wrong spot"),
            new Pair("Glasses",
                    "Optician: eye examination and new spectacles with anti-glare lenses.",
                    "eyewear prescription receipt"),
            new Pair("Furniture",
                    "Order confirmation: three-seater sofa in grey fabric, delivery within six weeks.",
                    "couch purchase delivery time"),
            new Pair("Television licence",
                    "Licence fee to watch live broadcasts, valid twelve months, renews automatically.",
                    "TV permit renewal"),
            new Pair("Plumber",
                    "Tradesman invoice: leaking pipe under the kitchen sink fixed, call-out charge and parts.",
                    "cost of fixing the dripping faucet"),
            new Pair("Doctor",
                    "Clinic letter: blood test results normal, follow-up consultation with the physician in three months.",
                    "GP checkup lab results"),
            new Pair("School trip",
                    "Permission slip and payment of 25 for the class excursion to the science museum.",
                    "field trip money for my son")
    );

    private GoldSet() {}

    /** Recall@k and mean reciprocal rank (over the full ranking returned). */
    public record Scores(double recallAt3, double mrr) {
        @Override
        public String toString() {
            return String.format(java.util.Locale.ROOT, "recall@3=%.3f MRR=%.3f", recallAt3, mrr);
        }
    }

    /** {@code rank} maps a query to its ranked list of passage titles (best first). */
    public static Scores evaluate(Function<String, List<String>> rank) {
        double hits = 0;
        double rr = 0;
        for (Pair p : PAIRS) {
            List<String> ranked = new ArrayList<>(rank.apply(p.query()));
            int pos = ranked.indexOf(p.title());
            if (pos >= 0 && pos < 3) {
                hits++;
            }
            if (pos >= 0) {
                rr += 1.0 / (pos + 1);
            }
        }
        return new Scores(hits / PAIRS.size(), rr / PAIRS.size());
    }
}
