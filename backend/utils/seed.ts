import * as schema from "#/data/schema";
import { faker } from "@faker-js/faker";
import { auth } from "#/lib/auth";
import { OurDb } from "#/data";
import { eq, sql } from "drizzle-orm";

export async function seedDatabase(db: OurDb) {
	// Seed users for testing - including authorization test users
	const usersToMake = {
		alexUser: "alex@v.alexw.codes", // Site admin with no company roles
		adminUser: "admin@v.alexw.codes", // Admin at Bob's Widgets (for salesperson record "Admin")
		bobUser: "bob@v.alexw.codes", // Admin at Bob's Widgets
		leeUser: "lee@v.alexw.codes", // Salesperson at Bob's Widgets
		angelaUser: "angela@v.alexw.codes", // Salesperson at Robert's Insurance
	};

	const actx = await auth.$context;
	const makeUser = async (email: string) => {
		const user = await auth.api.signUpEmail({
			body: {
				name: email.split("@")[0],
				email,
				password: "brazil-tree-fire",
			},
		});

		return {
			id: user.user.id,
		};
	};

	const users = {
		alex: await makeUser(usersToMake.alexUser),
		admin: await makeUser(usersToMake.adminUser),
		bob: await makeUser(usersToMake.bobUser),
		lee: await makeUser(usersToMake.leeUser),
		angela: await makeUser(usersToMake.angelaUser),
	};

	await db.transaction(async (tx) => {
		// Auth roles - both alex and admin are site admins
		// alex has no company roles, admin has company role at Bob's Widgets
		await tx
			.insert(schema.authUserRoles)
			.values([
				{ userId: users.alex.id, role: "admin" },
				{ userId: users.admin.id, role: "admin" }
			]);

		// The company - Bob's Widgets
		const bobWidgets = await tx
			.insert(schema.companies)
			.values({ name: "Bob's Widgets" })
			.returning();

		// Bob is company admin at Bob's Widgets
		const bobCompanyRole = await tx
			.insert(schema.companyUserRoles)
			.values({
				companyId: bobWidgets[0].id,
				userId: users.bob.id,
				role: "admin",
			})
			.returning();

		// admin user has company role at Bob's Widgets (for "Admin" salesperson)
		const adminCompanyRole = await tx
			.insert(schema.companyUserRoles)
			.values({
				companyId: bobWidgets[0].id,
				userId: users.admin.id,
				role: "salesperson",
			})
			.returning();

		const salesTeam = await tx
			.insert(schema.teams)
			.values({
				name: "Sales Team",
				companyId: bobWidgets[0].id,
			})
			.returning();

		// Admin salesperson (for admin@v.alexw.codes)
		const adminSalesperson = await tx
			.insert(schema.salespeople)
			.values({
				firstName: "Admin",
				lastName: "User",
				avatar: faker.image.avatar(),
				associatedUserId: users.admin.id,
				companyId: bobWidgets[0].id,
			})
			.returning();

		// Add company role for lee (same company as Bob)
		await tx
			.insert(schema.companyUserRoles)
			.values([
				{ companyId: bobWidgets[0].id, userId: users.lee.id, role: "salesperson" },
			]);

		// Bobby salesperson (for bob@v.alexw.codes - for authorization tests)
		const bobbySalesperson = await tx
			.insert(schema.salespeople)
			.values({
				firstName: "Bobby",
				lastName: "Smith",
				avatar: faker.image.avatar(),
				associatedUserId: users.bob.id,
				companyId: bobWidgets[0].id,
			})
			.returning();

		// Lee salesperson (same company as Bobby)
		const leeSalesperson = await tx
			.insert(schema.salespeople)
			.values({
				firstName: "Lee",
				lastName: "Johnson",
				avatar: faker.image.avatar(),
				associatedUserId: users.lee.id,
				companyId: bobWidgets[0].id,
			})
			.returning();

		// Robert's Insurance (Angela's company - different company for authorization tests)
		const robertsInsurance = await tx
			.insert(schema.companies)
			.values({ name: "Robert's Insurance" })
			.returning();

		await tx
			.insert(schema.companyUserRoles)
			.values({ companyId: robertsInsurance[0].id, userId: users.angela.id, role: "salesperson" });

		// Angela salesperson (at Robert's Insurance)
		const angelaSalesperson = await tx
			.insert(schema.salespeople)
			.values({
				firstName: "Angela",
				lastName: "Rodriguez",
				avatar: faker.image.avatar(),
				associatedUserId: users.angela.id,
				companyId: robertsInsurance[0].id,
			})
			.returning();

		// Company Training Data for Bob's Widgets
		await tx
			.insert(schema.companyTrainingData)
			.values({
				companyId: bobWidgets[0].id,
				onboardingDocument: `Bob's Widgets is a leading manufacturer of high-quality industrial widgets serving the manufacturing sector. Founded in 1995, we've built our reputation on reliability, innovation, and customer service excellence.

Our Mission: To empower manufacturers with cutting-edge widget solutions that drive productivity and profitability.

Company Values:
- Customer Success First
- Innovation
- Integrity
- Quality
- Teamwork`,
				idealResponses: {
					discovery_call: {
						ideal_response: "I appreciate you taking the time to speak with me today. Before I tell you about our solutions, I'd like to understand your current manufacturing process.",
						key_points: [
							"Start with genuine curiosity about their business",
							"Ask open-ended questions to uncover pain points",
							"Listen more than you talk in discovery"
						]
					},
					value_proposition: {
						ideal_response: "Based on what you've shared about your current challenges, our WidgetPro 3000 series could help you reduce downtime by 35-40%.",
						key_points: [
							"Reference specific pain points they mentioned",
							"Use quantifiable metrics and timeframes",
							"Focus on business outcomes, not features"
						]
					}
				},
				objectionHandlingGuide: {
					price_objection: {
						response_strategy: "Acknowledge their concern, reframe around value, and use cost of inaction.",
						examples: [
							"What would it mean to your bottom line if you could reduce production downtime by 35%?"
						]
					}
				},
				productPositioning: `Bob's Widgets delivers manufacturing transformation through intelligent widget solutions.`,
				competitorInfo: {},
				companyValues: ["Customer Success First", "Innovation", "Integrity", "Quality", "Teamwork"],
				targetCustomerProfile: `Mid-to-large manufacturers with 200+ employees`,
				salesMethodology: `MEDDIC qualification framework`
			});

		await tx
			.insert(schema.teamMembership)
			.values([
				{ teamId: salesTeam[0].id, salespersonId: adminSalesperson[0].id },
				{ teamId: salesTeam[0].id, salespersonId: bobbySalesperson[0].id },
				{ teamId: salesTeam[0].id, salespersonId: leeSalesperson[0].id },
			]);

		// Add some interactions and flags for Bobby (for flags tests)
		const bobbyInteraction = await tx
			.insert(schema.interactions)
			.values({
				salespersonId: bobbySalesperson[0].id,
				blurb: "Sample call with Bobby about product demo",
			})
			.returning();

		// Add flags for Bobby's interaction
		await tx.insert(schema.flags).values([
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "ollama",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 1",
					confidenceOutOf100: 80,
					validation_checklist: ["Check item 1"],
					what_happened: "This is a test flag for Bobby",
					revenue_impact: "Medium impact",
					better_response: ["Alternative response 1"],
					benchmarking_context: "Test context",
					role_expectation: "Expected behavior",
					why_this_matters: "Important for training",
					timestamps: { start: "00:01:00", end: "00:02:00" },
				},
			},
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "ollama",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 2",
					confidenceOutOf100: 70,
					validation_checklist: ["Check item 2"],
					what_happened: "Another test flag for Bobby",
					revenue_impact: "Low impact",
					better_response: ["Alternative response 2"],
					benchmarking_context: "Test context 2",
					role_expectation: "Expected behavior 2",
					why_this_matters: "Important for training 2",
					timestamps: { start: "00:03:00", end: "00:04:00" },
				},
			},
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "human",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 3",
					confidenceOutOf100: 90,
					validation_checklist: ["Check item 3"],
					what_happened: "Third test flag for Bobby",
					revenue_impact: "High impact",
					better_response: ["Alternative response 3"],
					benchmarking_context: "Test context 3",
					role_expectation: "Expected behavior 3",
					why_this_matters: "Important for training 3",
					timestamps: { start: "00:05:00", end: "00:06:00" },
				},
			},
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "ollama",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 4",
					confidenceOutOf100: 75,
					validation_checklist: ["Check item 4"],
					what_happened: "Fourth test flag for Bobby",
					revenue_impact: "Medium impact",
					better_response: ["Alternative response 4"],
					benchmarking_context: "Test context 4",
					role_expectation: "Expected behavior 4",
					why_this_matters: "Important for training 4",
					timestamps: { start: "00:07:00", end: "00:08:00" },
				},
			},
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "ollama",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 5",
					confidenceOutOf100: 65,
					validation_checklist: ["Check item 5"],
					what_happened: "Fifth test flag for Bobby",
					revenue_impact: "Low impact",
					better_response: ["Alternative response 5"],
					benchmarking_context: "Test context 5",
					role_expectation: "Expected behavior 5",
					why_this_matters: "Important for training 5",
					timestamps: { start: "00:09:00", end: "00:10:00" },
				},
			},
			{
				interactionId: bobbyInteraction[0].id,
				associatedSalespersonId: bobbySalesperson[0].id,
				source: "ollama",
				flagData: {
					revision: "v1",
					flag_title: "Test Flag 6",
					confidenceOutOf100: 85,
					validation_checklist: ["Check item 6"],
					what_happened: "Sixth test flag for Bobby",
					revenue_impact: "Medium impact",
					better_response: ["Alternative response 6"],
					benchmarking_context: "Test context 6",
					role_expectation: "Expected behavior 6",
					why_this_matters: "Important for training 6",
					timestamps: { start: "00:11:00", end: "00:12:00" },
				},
			},
		]);

		// Add interaction and flag for Lee
		const leeInteraction = await tx
			.insert(schema.interactions)
			.values({
				salespersonId: leeSalesperson[0].id,
				blurb: "Sample call with Lee about pricing",
			})
			.returning();

		await tx.insert(schema.flags).values({
			interactionId: leeInteraction[0].id,
			associatedSalespersonId: leeSalesperson[0].id,
			source: "ollama",
			flagData: {
				revision: "v1",
				flag_title: "Test Flag for Lee",
				confidenceOutOf100: 75,
				validation_checklist: ["Check item"],
				what_happened: "This is a test flag for Lee",
				revenue_impact: "Medium impact",
				better_response: ["Alternative response"],
				benchmarking_context: "Test context",
				role_expectation: "Expected behavior",
				why_this_matters: "Important for training",
				timestamps: { start: "00:01:00", end: "00:02:00" },
			},
		});

		// Add notifications for Bob's Widgets (Bobby's user)
		await tx.insert(schema.notifications).values([
			{
				userId: users.bob.id,
				message: "New training scenario available for objection handling",
				type: "info" as const,
			},
			{
				userId: users.bob.id,
				message: "Weekly performance report is ready",
				type: "success" as const,
			},
		]);

		// Add objections for Bob's Widgets
		await tx.insert(schema.objections).values([
			{
				companyId: bobWidgets[0].id,
				title: "Budget constraints",
				description: "Prospects citing limited budget or need for approval",
				frequency: 45,
				trend: "up",
				phase: "close",
				impact: "high",
			},
			{
				companyId: bobWidgets[0].id,
				title: "Need more time to decide",
				description: "Prospects want to delay decision making",
				frequency: 30,
				trend: "stable",
				phase: "close",
				impact: "medium",
			},
		]);

		// Add objections for Robert's Insurance
		await tx.insert(schema.objections).values([
			{
				companyId: robertsInsurance[0].id,
				title: "Already have coverage",
				description: "Prospects already have existing insurance policies",
				frequency: 55,
				trend: "stable",
				phase: "discovery",
				impact: "high",
			},
			{
				companyId: robertsInsurance[0].id,
				title: "Premium too expensive",
				description: "Prospects concerned about premium costs",
				frequency: 40,
				trend: "up",
				phase: "close",
				impact: "high",
			},
		]);

		// Add pain points for Bob's Widgets (prospect pains)
		// severity enum: "critical", "major", "minor"
		await tx.insert(schema.painPoints).values([
			{
				companyId: bobWidgets[0].id,
				title: "Inefficient manual processes",
				description: "Prospects struggling with time-consuming manual workflows",
				frequency: 72,
				phase: "discovery",
				severity: "critical",
				isProspectPain: true,
			},
			{
				companyId: bobWidgets[0].id,
				title: "Lack of real-time data",
				description: "Prospects need better visibility into operations",
				frequency: 58,
				phase: "discovery",
				severity: "major",
				isProspectPain: true,
			},
		]);

		// Add pain points for Robert's Insurance (prospect pains)
		await tx.insert(schema.painPoints).values([
			{
				companyId: robertsInsurance[0].id,
				title: "Complex policy comparisons",
				description: "Prospects struggle comparing different insurance options",
				frequency: 65,
				phase: "discovery",
				severity: "major",
				isProspectPain: true,
			},
			{
				companyId: robertsInsurance[0].id,
				title: "Claim process confusion",
				description: "Prospects unsure about claims procedures",
				frequency: 48,
				phase: "close",
				severity: "minor",
				isProspectPain: true,
			},
		]);

		// Add training scenarios
		await tx.insert(schema.trainingScenarios).values([
			{
				skillKey: 'objection_handling',
				scenarioId: 'pricing_objection_1',
				title: 'Budget Constraints - Enterprise Client',
				difficulty: 'Advanced',
				duration: '15-20 min',
				participants: 2,
				context: 'Enterprise software renewal where client claims budget cuts',
				scenario: 'Your client is up for renewal on their enterprise software package.',
				objectives: [
					'Uncover the real budget concerns',
					'Present ROI data to justify the investment',
					'Secure commitment to renewal'
				],
				commonObjections: [
					'We need to cut software spending by 30% this year',
					'Your competitors are offering similar for much less'
				],
				idealOutcome: 'Client commits to renewal with maintained revenue',
				aiPrompt: 'You are Sarah Martinez, VP of Operations at TechCorp Solutions. You\'ve been using the software for 2 years with good results, but you\'re under pressure from the board to cut costs.',
				firstMessage: "Look, I'm going to be straight with you. We love the software - it's been great for us. But the board just came down hard on all department heads to cut spending by 30%. I'm not sure how we're going to make this work.",
				prospectData: {
					name: 'Sarah Martinez',
					company: 'TechCorp Solutions',
					role: 'VP of Operations',
					personality: 'Analytical, budget-conscious'
				}
			},
			{
				skillKey: 'discovery',
				scenarioId: 'discovery_deep_dive_1',
				title: 'Complex Enterprise Discovery',
				difficulty: 'Advanced',
				duration: '25-30 min',
				participants: 2,
				context: 'Multi-stakeholder enterprise opportunity',
				scenario: 'Initial discovery call with a VP of Technology at a large enterprise.',
				objectives: [
					'Uncover business challenges and technical requirements',
					'Identify key stakeholders',
					'Map current state and desired future state'
				],
				commonObjections: [
					'We already have a solution that works fine',
					'Our IT team is skeptical of new implementations'
				],
				idealOutcome: 'Complete understanding of opportunity with clear next steps',
				aiPrompt: 'You are Sarah Kim, VP of Technology at Enterprise Solutions Corp. You\'re evaluating new technology solutions but are cautious.',
				firstMessage: "Hi, thanks for taking the time. So, I'll be honest - we're looking at a few different options right now. Tell me a bit about what you do and we'll see if there's a fit.",
				prospectData: {
					name: 'Sarah Kim',
					company: 'Enterprise Solutions Corp',
					role: 'VP of Technology',
					personality: 'Technical, detail-oriented'
				}
			},
			{
				skillKey: 'closing',
				scenarioId: 'assumptive_close_1',
				title: 'Assumptive Close - Mid Market',
				difficulty: 'Intermediate',
				duration: '10-15 min',
				participants: 2,
				context: 'Mid-market opportunity ready for close',
				scenario: 'You\'ve completed a thorough sales process and the prospect has expressed strong interest.',
				objectives: [
					'Read buying signals accurately',
					'Use assumptive closing techniques',
					'Secure commitment and next steps'
				],
				commonObjections: [
					'I just want to run this by my team one more time',
					'Let me think about it over the weekend'
				],
				idealOutcome: 'Prospect commits to moving forward',
				aiPrompt: 'You are Mike Johnson, Operations Director at Growth Partners LLC. You\'re convinced the solution is right but naturally cautious.',
				firstMessage: "So I've reviewed everything with the team and, yeah, we're pretty much on board. I just... I want to make sure we're doing the right thing here, you know? What happens after we sign?",
				prospectData: {
					name: 'Mike Johnson',
					company: 'Growth Partners LLC',
					role: 'Operations Director',
					personality: 'Decisive but wants reassurance'
				}
			},
			{
				skillKey: 'pricing_discussions',
				scenarioId: 'pricing_negotiation_1',
				title: 'Price Negotiation - Enterprise Deal',
				difficulty: 'Advanced',
				duration: '15-20 min',
				participants: 2,
				context: 'Enterprise deal where the prospect is pushing for discounts',
				scenario: 'Your prospect likes the solution but is pushing hard on price, requesting a 30% discount to move forward.',
				objectives: [
					'Defend your pricing with value-based justifications',
					'Understand the real budget constraints',
					'Find creative ways to deliver value without deep discounting',
					'Maintain deal value while keeping the prospect engaged'
				],
				commonObjections: [
					'Your competitors quoted us 30% less',
					'We can only get budget approval at a lower price point',
					'We love your product but the CFO won\'t sign off at this price'
				],
				idealOutcome: 'Prospect agrees to move forward at minimal discount with clear value understanding',
				aiPrompt: 'You are David Chen, Director of Procurement at GlobalTech Industries. You genuinely like the product and want to buy it, but you\'re under pressure from your CFO to negotiate the best possible deal. You have some flexibility but need to demonstrate you fought for savings.',
				firstMessage: "I really like what you've shown us. The product is solid and I think it would work well for our team. But I have to be upfront with you - the price is not where we need it to be. What can you do for us?",
				prospectData: {
					name: 'David Chen',
					company: 'GlobalTech Industries',
					role: 'Director of Procurement',
					personality: 'Tough negotiator but fair, values long-term partnerships'
				}
			}
		]);
	});

	return users;
}
