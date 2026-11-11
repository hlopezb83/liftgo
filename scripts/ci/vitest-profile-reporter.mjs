export default class ProfileReporter {
  onTestRunEnd(modules) {
    for (const module of modules) {
      const { duration, collectDuration, setupDuration, environmentSetupDuration, prepareDuration } = module.diagnostic()
      console.log(JSON.stringify([module.relativeModuleId, duration, collectDuration, setupDuration, environmentSetupDuration, prepareDuration, module.state()]))
    }
  }
}
