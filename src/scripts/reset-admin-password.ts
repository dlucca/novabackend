import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/utils"

export default async function resetAdminPassword({
  container,
}: {
  container: MedusaContainer
}) {
  const authModuleService = container.resolve(Modules.AUTH)
  const userModuleService = container.resolve(Modules.USER)

  const email = "cristian@novapatch.care"

  // 1. Delete provider identities
  const providerIdentities = await authModuleService.listProviderIdentities({
    entity_id: email,
    provider: "emailpass",
  })

  if (providerIdentities.length > 0) {
    await authModuleService.deleteProviderIdentities(
      providerIdentities.map((p) => p.id)
    )
    console.log(`Deleted ${providerIdentities.length} provider identity/ies`)
  }

  // 2. Delete auth identities that have no more provider identities
  const authIdentities = await authModuleService.listAuthIdentities({})
  for (const ai of authIdentities) {
    const remaining = await authModuleService.listProviderIdentities({
      auth_identity_id: ai.id,
    })
    if (remaining.length === 0) {
      await authModuleService.deleteAuthIdentities([ai.id])
      console.log(`Deleted orphan auth identity ${ai.id}`)
    }
  }

  // 3. Delete the user record
  const users = await userModuleService.listUsers({ email })
  if (users.length > 0) {
    await userModuleService.deleteUsers(users.map((u) => u.id))
    console.log(`Deleted user ${email}`)
  }

  console.log("\n✅ Done. Now run:")
  console.log(
    `DATABASE_URL="..." npx medusa user -e ${email} -p TuNuevaPassword`
  )
}
