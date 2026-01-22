# k6 Load Tests for Vantage.ai Backend

Load and performance tests for the Vantage.ai backend API, designed to validate the system can handle the alpha user target of ~50 concurrent users.

## Overview

This directory contains k6 load tests for the Vantage.ai backend. The tests focus on GET endpoint performance to ensure the system can handle realistic user loads.

### Test Suite

1. **Sustained Load Test** (`tests/sustained-load.js`)
   - 15 concurrent users
   - 90 second duration
   - Frequent GET requests (every 2-3 seconds)
   - Validates normal operating conditions

2. **Stress/Spike Test** (`tests/stress-spike.js`)
   - 70 concurrent users
   - Includes a 15-second spike period with high-frequency requests
   - Tests system resilience and recovery
   - Validates performance under stress

## Prerequisites

### Install k6

**macOS (Homebrew):**
```bash
brew install k6
```

**Linux:**
```bash
# Debian/Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows (Chocolatey):**
```bash
choco install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

For other installation methods, see: https://k6.io/docs/get-started/installation/

## Setup

### 1. Configure Environment

Create a `.env` file in the k6 directory (or set environment variables):

```bash
# Base URL of your backend
BASE_URL=http://localhost:5025

# Test user credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testpassword123
```

Alternatively, set environment variables directly:

```bash
export BASE_URL=http://localhost:5025
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=testpassword123
```

### 2. Start Your Backend

Ensure your backend server is running before executing tests:

```bash
cd ../backend
mise run start_backend
# or
pnpm run dev
```

### 3. Create Test User(s)

Make sure you have at least one test user created in your system with the credentials specified above.

For multiple concurrent users, the tests support email aliasing:
- Base: `test@example.com`
- VU 1: `test+1@example.com`
- VU 2: `test+2@example.com`
- etc.

## Running Tests

### Sustained Load Test (15 users, 90 seconds)

```bash
cd k6
k6 run tests/sustained-load.js
```

With custom configuration:
```bash
k6 run --vus 20 --duration 120s tests/sustained-load.js
```

### Stress/Spike Test (70 users with spike)

```bash
cd k6
k6 run tests/stress-spike.js
```

### Using Docker

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:5025 \
  -e TEST_USER_EMAIL=test@example.com \
  -e TEST_USER_PASSWORD=testpassword123 \
  -v $PWD:/tests \
  grafana/k6 run /tests/tests/sustained-load.js
```

## Understanding Results

### Key Metrics

k6 provides several important metrics:

- **http_req_duration**: Response time (aim for p95 < 500ms for sustained, < 1000ms for spike)
- **http_req_failed**: Error rate (aim for < 1% sustained, < 5% spike)
- **http_reqs**: Total number of requests
- **vus**: Virtual users (concurrent users)
- **iterations**: Number of complete test iterations

### Success Thresholds

**Sustained Load Test:**
- ✅ 95th percentile response time < 500ms
- ✅ Error rate < 1%
- ✅ Auth errors < 1%
- ✅ Check pass rate > 95%

**Stress/Spike Test:**
- ✅ 95th percentile response time < 1000ms overall
- ✅ 95th percentile response time < 1500ms during spike
- ✅ Error rate < 5% overall, < 10% during spike
- ✅ Auth errors < 2%
- ✅ Check pass rate > 90%

### Example Output

```
     ✓ status is 200
     ✓ response has body
     ✓ response is JSON

     checks.........................: 98.50% ✓ 2955     ✗ 45
     data_received..................: 2.1 MB 23 kB/s
     data_sent......................: 456 kB 5.1 kB/s
     http_req_blocked...............: avg=1.2ms    min=1µs     med=4µs     max=125ms   p(95)=5ms    p(99)=15ms
     http_req_duration..............: avg=145ms    min=12ms    med=98ms    max=2.1s    p(95)=425ms  p(99)=890ms
     http_reqs......................: 985    10.9/s
     iterations.....................: 985    10.9/s
     vus............................: 15     min=15     max=15
```

## Interpreting Results

### Good Results ✅
- Most response times under 500ms
- Error rate close to 0%
- Steady throughput throughout test
- No timeouts or connection errors

### Warning Signs ⚠️
- Response times creeping above 1000ms
- Error rate between 1-5%
- Increasing response times over test duration
- Occasional timeouts

### Problems ❌
- Response times consistently above 2000ms
- Error rate above 5%
- Connection refused errors
- Out of memory errors in backend logs

## Customizing Tests

### Adjust Virtual Users

Edit the test files directly or use CLI flags:

```bash
k6 run --vus 30 tests/sustained-load.js
```

### Adjust Duration

```bash
k6 run --duration 300s tests/sustained-load.js
```

### Target Different Environment

```bash
BASE_URL=https://staging.example.com k6 run tests/sustained-load.js
```

### Add New Endpoints

Edit `config/endpoints.js` to add new endpoints:

```javascript
export const endpoints = {
  // ... existing endpoints
  myNewEndpoint: `${BASE_PATH}/api/my-new-endpoint`,
};

// Update weights
export const endpointWeights = {
  // ... existing weights
  myNewEndpoint: 5,  // 5% of requests
};
```

## Advanced Usage

### Output Results to File

```bash
k6 run --out json=results.json tests/sustained-load.js
```

### Integration with CI/CD

```bash
# Run test and fail if thresholds not met
k6 run --quiet tests/sustained-load.js && echo "✅ Tests passed" || echo "❌ Tests failed"
```

### Cloud Results (k6 Cloud)

```bash
# Sign up at https://app.k6.io
k6 login cloud
k6 cloud tests/sustained-load.js
```

### InfluxDB + Grafana Integration

```bash
# Send metrics to InfluxDB
k6 run --out influxdb=http://localhost:8086/myk6db tests/sustained-load.js
```

## Troubleshooting

### Authentication Failures

**Problem:** Tests fail with 401 Unauthorized

**Solutions:**
- Verify test user credentials are correct
- Check that test user exists in database
- Ensure authentication endpoint is working: `curl -X POST http://localhost:5025/api/auth/sign-in/email`
- Check backend logs for auth errors

### Connection Refused

**Problem:** k6 can't connect to backend

**Solutions:**
- Verify backend is running: `curl http://localhost:5025/vantage/health`
- Check BASE_URL is correct
- Ensure no firewall blocking connections
- If using Docker, use `host.docker.internal` instead of `localhost`

### High Error Rates

**Problem:** Error rate above threshold

**Solutions:**
- Check backend logs for errors
- Verify database is running and responsive
- Check for resource limits (CPU, memory, connections)
- Reduce load and gradually increase

### Slow Response Times

**Problem:** Response times exceed thresholds

**Solutions:**
- Profile backend to find bottlenecks
- Check database query performance
- Verify no resource constraints
- Consider caching frequently accessed data
- Review backend logs for slow queries

## Best Practices

1. **Run Tests Regularly**
   - Before major releases
   - After performance-sensitive changes
   - As part of CI/CD pipeline

2. **Start Small**
   - Begin with fewer users
   - Gradually increase load
   - Identify breaking points

3. **Monitor During Tests**
   - Watch backend logs
   - Monitor database connections
   - Check system resources (CPU, memory)

4. **Test Realistic Scenarios**
   - Use actual user behavior patterns
   - Include think time between requests
   - Test various endpoint combinations

5. **Document Baselines**
   - Record baseline performance
   - Track performance over time
   - Set alerts for regressions

## File Structure

```
k6/
├── README.md                 # This file
├── .env.example             # Example environment variables
├── config/
│   └── endpoints.js         # API endpoint configuration
├── lib/
│   └── auth.js             # Authentication helpers
└── tests/
    ├── sustained-load.js   # Test 1: Sustained load
    └── stress-spike.js     # Test 2: Stress spike
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [Load Testing Best Practices](https://k6.io/docs/testing-guides/api-load-testing/)
- [k6 Community](https://community.k6.io/)

## Support

For issues or questions:
1. Check backend logs: `mise run start_backend`
2. Review k6 output for specific errors
3. Verify test configuration in `.env`
4. Check system resources during test execution

## Next Steps

After running these tests:
1. **Review Results** - Analyze metrics and identify bottlenecks
2. **Optimize** - Address any performance issues found
3. **Increase Load** - Gradually test with more users
4. **Add Tests** - Create tests for POST/PUT/DELETE operations
5. **Automate** - Integrate into CI/CD pipeline
6. **Monitor Production** - Set up similar monitoring in production