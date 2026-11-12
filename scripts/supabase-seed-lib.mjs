// Shared by supabase-seed.mjs and dev-db.mjs: insert sample households + members.
export async function insertDemoHouseholds(supabase, DEMO_HOUSEHOLDS) {
  for (const h of DEMO_HOUSEHOLDS) {
    const { data: household, error } = await supabase
      .from('households')
      .insert({
        household_name: h.householdName,
        street: h.street,
        barangay: h.barangay,
        city: h.city,
        province: h.province,
        zip: h.zip,
        contact: h.contact || null,
        email: h.email || null,
        gkk: h.gkk || null,
        family_grouping: h.familyGrouping || null,
        status: h.status,
        volunteer: h.volunteer || null,
        notify_optin: !!h.notifyOptin,
        consent: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    const rows = h.members.map((m) => ({
      household_id: household.id,
      first_name: m.firstName,
      middle_name: m.middleName || null,
      last_name: m.lastName,
      relationship: m.relationship || null,
      sex: m.sex || null,
      dob: m.dob || null,
      place_of_birth: m.placeOfBirth || null,
      civil_status: m.civilStatus || null,
      contact: m.contact || null,
      email: m.email || null,
      occupation: m.occupation || null,
      blood_type: m.bloodType || null,
      occupation_group: m.occupationGroup || null,
      ofw_status: m.ofwStatus || null,
      ofw_since: m.ofwSince || null,
      has_baptism: !!m.hasBaptism, baptism_date: m.baptismDate || null, baptism_church: m.baptismChurch || null,
      has_communion: !!m.hasCommunion, communion_date: m.communionDate || null, communion_church: m.communionChurch || null,
      has_confirmation: !!m.hasConfirmation, conf_date: m.confDate || null, conf_church: m.confChurch || null,
      conf_name: m.confName || null, conf_sponsor: m.confSponsor || null,
      has_matrimony: !!m.hasMatrimony, mat_date: m.matDate || null, mat_church: m.matChurch || null, mat_type: m.matType || null,
      ministries: m.ministries || [],
      organizations: m.organizations || [],
    }));
    const { error: mErr } = await supabase.from('members').insert(rows);
    if (mErr) throw mErr;
  }
  console.log(`Seeded ${DEMO_HOUSEHOLDS.length} demo households.`);
}
